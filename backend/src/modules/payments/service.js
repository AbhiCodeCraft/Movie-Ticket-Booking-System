import { ApiError } from '../../utils/errors.js';
import { bookingTransaction,lockedBooking,ownsLiveSeats } from '../bookings/service.js';
import { paymentsRepository } from './repository.js';
const conflict = message => new ApiError(409,'BOOKING_CONFLICT',message);
export function paymentsService(pool,config) {
  return {
    async pay(user,id,input,key) {
      if (!['development','test'].includes(config.NODE_ENV)) throw new ApiError(403,'SIMULATION_DISABLED','Simulated payments are disabled in production');
      return bookingTransaction(pool,async (db,repo) => {
        const { booking,seats,now } = await lockedBooking(repo,id,user);
        const payments = paymentsRepository(db), previous = await payments.byKey(id,key);
        if (previous) {
          if (previous.payment_method !== input.payment_method || previous.requested_outcome !== input.outcome) return conflict('Payment key was already used for different parameters');
          return { booking:await repo.detail(id),payment:previous,replayed:true };
        }
        if (!ownsLiveSeats(booking,seats,now)) return conflict('Reservation is expired, replaced, cancelled or already confirmed');
        const payment = await payments.create(booking,input,key);
        if (input.outcome === 'SUCCESS') await repo.confirm(id);
        return { booking:await repo.detail(id),payment,replayed:false };
      });
    },
    async cancel(user,id) {
      return bookingTransaction(pool,async (db,repo) => {
        const { booking,show,now } = await lockedBooking(repo,id,user,true);
        if (booking.status === 'CANCELLED') return repo.detail(id); // Replay, not a new refund.
        if (show.start_time <= now) return conflict('Cannot cancel after show start');
        if (!['PENDING','CONFIRMED'].includes(booking.status)) return conflict('Booking cannot be cancelled in its current state');
        await paymentsRepository(db).refund(id);
        await repo.cancel(id);
        return repo.detail(id);
      });
    },
  };
}

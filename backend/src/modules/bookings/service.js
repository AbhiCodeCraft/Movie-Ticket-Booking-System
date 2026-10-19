import { randomUUID } from 'node:crypto';
import { transaction } from '../../db/transaction.js';
import { ApiError, required } from '../../utils/errors.js';
import { bookingsRepository } from './repository.js';
const conflict = message => new ApiError(409,'BOOKING_CONFLICT',message);
const sameIds = (a,b) => a.length === b.length && a.every((id,i) => id === b[i]);
const sorted = ids => [...ids].sort((a,b) => BigInt(a)<BigInt(b) ? -1 : 1);
export function assertOwner(booking,user,allowAdmin=false) {
  if (booking.user_id !== user.user_id && !(allowAdmin && user.role === 'ADMIN')) throw new ApiError(403,'FORBIDDEN','Booking belongs to another user');
}
// Commit expiry cleanup even when the requested transition returns an expected conflict.
export async function bookingTransaction(pool,work) {
  const result = await transaction(pool, async db => {
    await db.query("SET LOCAL lock_timeout='3s'");
    await db.query("SET LOCAL statement_timeout='10s'");
    return work(db,bookingsRepository(db));
  });
  if (result instanceof ApiError) throw result;
  return result;
}
export async function lockedBooking(repo,id,user,allowAdmin=false) {
  const initial = required(await repo.booking(id));
  assertOwner(initial,user,allowAdmin);
  const show = required(await repo.lockShow(initial.show_id));
  await repo.expire(show.show_id);
  const booking = required(await repo.booking(id,true));
  const seats = await repo.lockSeats(await repo.seatIds(id));
  const now = await repo.clock(); // Read after any row-lock wait, never transaction-start time.
  if (booking.status === 'PENDING' && booking.hold_id && (booking.expires_at <= now || show.start_time <= now)) {
    await repo.expire(show.show_id);
    booking.status='EXPIRED';
  }
  return { booking,show,seats,now };
}
export function ownsLiveSeats(booking,seats,now) {
  return booking.status === 'PENDING' && booking.hold_id && booking.expires_at > now && seats.length > 0 &&
    seats.every(s => s.current_booking_id === booking.booking_id && s.status === 'LOCKED' && s.locked_by === booking.user_id && s.locked_until > now);
}
export function bookingsService(pool,config) {
  return {
    async hold(user,showId,input,key) {
      return bookingTransaction(pool,async (db,repo) => {
        const show = required(await repo.lockShow(showId));
        await repo.expire(showId);
        const ids = sorted(input.seatIds);
        const existing = await repo.byKey(user.user_id,key);
        if (existing) {
          if (existing.show_id !== showId || !sameIds(ids,await repo.seatIds(existing.booking_id))) return conflict('Idempotency key was already used for a different selection');
          return { created:false,data:await repo.detail(existing.booking_id) };
        }
        const seats = await repo.lockSeats(ids), now = await repo.clock();
        if (show.start_time <= now) return conflict('Show has already started');
        if (seats.length !== ids.length) throw new ApiError(404,'NOT_FOUND','One or more show-seat IDs do not exist');
        if (seats.some(s => s.show_id !== showId)) throw new ApiError(400,'INVALID_SELECTION','All show-seat IDs must belong to the selected show');
        if (seats.some(s => s.status === 'BOOKED' || (s.status === 'LOCKED' && s.locked_until > now))) return conflict('One or more seats are unavailable');
        if (!await repo.totalFits(ids)) return conflict('Selection exceeds the supported booking total');
        const b = await repo.createHold(user.user_id,showId,randomUUID(),key,ids,config.HOLD_TTL_SECONDS);
        return { created:true,data:await repo.detail(b.booking_id) };
      });
    },
    async create(user,holdId) {
      return bookingTransaction(pool,async (db,repo) => {
        const initial = required(await repo.byHold(holdId));
        const { booking,seats,now } = await lockedBooking(repo,initial.booking_id,user);
        if (!ownsLiveSeats(booking,seats,now)) return conflict('Reservation is no longer pending and valid');
        return repo.detail(booking.booking_id);
      });
    },
    async get(user,id) {
      return bookingTransaction(pool,async (db,repo) => {
        await lockedBooking(repo,id,user);
        return repo.detail(id);
      });
    },
    async history(user,filter) {
      return transaction(pool,async db => {
        await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const repo = bookingsRepository(db), result = await repo.history(user.user_id,filter);
        const data = [];
        for (const id of result.ids) data.push(await repo.detail(id));
        return { data,pagination:{ ...filter,total:result.total } };
      });
    },
  };
}

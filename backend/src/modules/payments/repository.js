import { randomUUID } from 'node:crypto';
export const paymentsRepository = db => ({
  async byKey(bookingId,key) { return (await db.query('SELECT * FROM payments WHERE booking_id=$1 AND idempotency_key=$2',[bookingId,key])).rows[0]; },
  async create(booking,input,key) {
    return (await db.query(`INSERT INTO payments(booking_id,amount,payment_method,status,transaction_id,idempotency_key,requested_outcome)
      VALUES($1,$2,$3,$4,$5,$6,$4) RETURNING *`,[booking.booking_id,booking.total_amount,input.payment_method,input.outcome,'sim-'+randomUUID(),key])).rows[0];
  },
  async refund(bookingId) { await db.query("UPDATE payments SET status='REFUNDED',refunded_at=clock_timestamp() WHERE booking_id=$1 AND status='SUCCESS'",[bookingId]); },
});

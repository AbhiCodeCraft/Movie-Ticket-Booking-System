export function bookingsRepository(db) {
  return {
    async clock() { return (await db.query('SELECT clock_timestamp() AS now')).rows[0].now; },
    async lockShow(id) { return (await db.query('SELECT * FROM shows WHERE show_id=$1 FOR UPDATE',[id])).rows[0]; },
    async booking(id, lock = false) { return (await db.query(`SELECT * FROM bookings WHERE booking_id=$1${lock ? ' FOR UPDATE' : ''}`,[id])).rows[0]; },
    async byHold(id) { return (await db.query('SELECT * FROM bookings WHERE hold_id=$1',[id])).rows[0]; },
    async byKey(userId,key) { return (await db.query('SELECT * FROM bookings WHERE user_id=$1 AND idempotency_key=$2',[userId,key])).rows[0]; },
    async seatIds(id) { return (await db.query('SELECT show_seat_id FROM booking_seats WHERE booking_id=$1 ORDER BY show_seat_id',[id])).rows.map(r => r.show_seat_id); },
    async lockSeats(ids) { return (await db.query('SELECT * FROM show_seats WHERE show_seat_id=ANY($1::bigint[]) ORDER BY show_seat_id FOR UPDATE',[ids])).rows; },
    async expire(showId) {
      const expired = (await db.query(`SELECT b.booking_id FROM bookings b JOIN shows s USING(show_id)
        WHERE b.show_id=$1 AND b.status='PENDING' AND b.hold_id IS NOT NULL
        AND (b.expires_at <= clock_timestamp() OR s.start_time <= clock_timestamp())
        ORDER BY b.booking_id FOR UPDATE OF b`,[showId])).rows.map(r => r.booking_id);
      if (!expired.length) return;
      await db.query('SELECT show_seat_id FROM show_seats WHERE current_booking_id=ANY($1::bigint[]) ORDER BY show_seat_id FOR UPDATE',[expired]);
      await db.query("UPDATE show_seats SET status='AVAILABLE',locked_by=NULL,locked_until=NULL,current_booking_id=NULL WHERE current_booking_id=ANY($1::bigint[]) AND status='LOCKED'",[expired]);
      await db.query("UPDATE bookings SET status='EXPIRED' WHERE booking_id=ANY($1::bigint[])",[expired]);
    },
    async createHold(userId,showId,holdId,key,ids,ttl) {
      // Sum and expiry arithmetic stay in PostgreSQL; no floating-point money.
      const booking = (await db.query(`INSERT INTO bookings(show_id,user_id,total_amount,hold_id,idempotency_key,expires_at)
        SELECT $1,$2,sum(price),$3,$4,LEAST(clock_timestamp()+make_interval(secs => $6), (SELECT start_time FROM shows WHERE show_id=$1))
        FROM show_seats WHERE show_seat_id=ANY($5::bigint[]) RETURNING *`,[showId,userId,holdId,key,ids,ttl])).rows[0];
      await db.query(`INSERT INTO booking_seats(booking_id,show_seat_id,show_id,price)
        SELECT $1,show_seat_id,show_id,price FROM show_seats WHERE show_seat_id=ANY($2::bigint[])`,[booking.booking_id,ids]);
      await db.query("UPDATE show_seats SET status='LOCKED',locked_by=$2,locked_until=$3,current_booking_id=$4 WHERE show_seat_id=ANY($1::bigint[])", [ids,userId,booking.expires_at,booking.booking_id]);
      return booking;
    },
    async totalFits(ids) { return (await db.query("SELECT sum(price) <= 99999999.99 AND bool_and(price <> 'NaN'::numeric) AS valid FROM show_seats WHERE show_seat_id=ANY($1::bigint[])",[ids])).rows[0].valid; },
    async confirm(id) {
      await db.query('UPDATE booking_seats SET active=TRUE WHERE booking_id=$1',[id]);
      await db.query("UPDATE show_seats SET status='BOOKED',locked_by=NULL,locked_until=NULL WHERE current_booking_id=$1",[id]);
      await db.query("UPDATE bookings SET status='CONFIRMED' WHERE booking_id=$1",[id]);
    },
    async cancel(id) {
      await db.query('UPDATE booking_seats SET active=FALSE WHERE booking_id=$1',[id]);
      await db.query("UPDATE show_seats SET status='AVAILABLE',locked_by=NULL,locked_until=NULL,current_booking_id=NULL WHERE current_booking_id=$1",[id]);
      await db.query("UPDATE bookings SET status='CANCELLED' WHERE booking_id=$1",[id]);
    },
    async detail(id) {
      const booking = (await db.query(`SELECT b.booking_id,b.show_id,b.user_id,b.hold_id,b.total_amount,b.created_at,b.expires_at,
        CASE WHEN b.status='PENDING' AND b.hold_id IS NOT NULL AND (b.expires_at<=clock_timestamp() OR s.start_time<=clock_timestamp()) THEN 'EXPIRED' ELSE b.status END AS status,
        m.movie_id,m.title AS movie_title,s.start_time,s.end_time,a.auditorium_id,a.audi_number,t.theatre_id,t.theatre_name,t.location
        FROM bookings b JOIN shows s USING(show_id) JOIN movies m USING(movie_id)
        JOIN auditoriums a USING(auditorium_id) JOIN theatres t USING(theatre_id) WHERE b.booking_id=$1`,[id])).rows[0];
      if (!booking) return undefined;
      booking.seats = (await db.query(`SELECT bs.show_seat_id,bs.price,s.seat_number,s.row,s."column",s.seat_type
        FROM booking_seats bs JOIN show_seats ss USING(show_seat_id) JOIN seats s USING(seat_id)
        WHERE bs.booking_id=$1 ORDER BY bs.show_seat_id`,[id])).rows;
      booking.payments = (await db.query('SELECT payment_id,amount,payment_method,status,transaction_id,created_at,refunded_at FROM payments WHERE booking_id=$1 ORDER BY payment_id',[id])).rows;
      booking.payment_status = booking.payments.at(-1)?.status ?? 'UNPAID';
      return booking;
    },
    async history(userId,{page,limit}) {
      const total = (await db.query('SELECT count(*)::int AS total FROM bookings WHERE user_id=$1',[userId])).rows[0].total;
      const ids = (await db.query('SELECT booking_id FROM bookings WHERE user_id=$1 ORDER BY booking_id DESC LIMIT $2 OFFSET $3',[userId,limit,(page-1)*limit])).rows;
      return { ids:ids.map(r => r.booking_id),total };
    },
  };
}

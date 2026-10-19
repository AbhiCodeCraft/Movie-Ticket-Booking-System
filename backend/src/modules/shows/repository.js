export const showsRepository = db => ({
  async lockAuditorium(id) { return (await db.query('SELECT * FROM auditoriums WHERE auditorium_id=$1 FOR UPDATE', [id])).rows[0]; },
  async hasBookings(id) { return (await db.query('SELECT 1 FROM bookings WHERE show_id=$1 LIMIT 1',[id])).rowCount > 0; },
  async generateSeats(show, price) {
    return (await db.query('INSERT INTO show_seats(show_id,seat_id,auditorium_id,price) SELECT $1,seat_id,auditorium_id,$2 FROM seats WHERE auditorium_id=$3 RETURNING show_seat_id', [show.show_id,price,show.auditorium_id])).rowCount;
  },
  async availability(id) { return (await db.query(`SELECT ss.show_seat_id,ss.seat_id,ss.price,
    CASE WHEN ss.status='LOCKED' AND ss.locked_until<=clock_timestamp() THEN 'AVAILABLE' ELSE ss.status END AS status,
    s.seat_number,s.row,s."column",s.seat_type FROM show_seats ss JOIN seats s ON s.seat_id=ss.seat_id
    WHERE ss.show_id=$1 ORDER BY s.row,s."column"`, [id])).rows; },
  async clearSeats(id) { await db.query('DELETE FROM show_seats WHERE show_id=$1',[id]); },
  async price(id, price) { await db.query('UPDATE show_seats SET price=$2 WHERE show_id=$1',[id,price]); },
});

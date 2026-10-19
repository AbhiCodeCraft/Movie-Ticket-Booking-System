-- Existing M1 bookings remain readable; only new reservations require a hold identity.
ALTER TABLE bookings ADD COLUMN hold_id UUID UNIQUE;
ALTER TABLE bookings ADD COLUMN expires_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN idempotency_key UUID;
ALTER TABLE bookings ADD CONSTRAINT bookings_hold_shape CHECK
 ((hold_id IS NULL AND expires_at IS NULL AND idempotency_key IS NULL)
 OR (hold_id IS NOT NULL AND expires_at IS NOT NULL AND idempotency_key IS NOT NULL));
CREATE UNIQUE INDEX bookings_user_request_unique ON bookings(user_id,idempotency_key);
CREATE INDEX bookings_pending_expiry_idx ON bookings(show_id,expires_at) WHERE status='PENDING';
CREATE INDEX bookings_user_history_idx ON bookings(user_id,booking_id DESC);

ALTER TABLE booking_seats ADD COLUMN price NUMERIC(10,2) CHECK(price > 0 AND price <> 'NaN'::numeric);
UPDATE booking_seats bs SET price=ss.price FROM show_seats ss WHERE ss.show_seat_id=bs.show_seat_id;
ALTER TABLE booking_seats ADD COLUMN active BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE booking_seats bs SET active=TRUE FROM bookings b WHERE b.booking_id=bs.booking_id AND b.status='CONFIRMED';
-- Historical cancelled/expired associations do not block future bookings.
CREATE UNIQUE INDEX booking_seats_one_active_owner ON booking_seats(show_seat_id) WHERE active;

ALTER TABLE show_seats ADD COLUMN current_booking_id BIGINT;
ALTER TABLE show_seats ADD CONSTRAINT show_seats_current_booking_fk
 FOREIGN KEY(current_booking_id,show_id) REFERENCES bookings(booking_id,show_id) ON DELETE RESTRICT;
UPDATE show_seats ss SET current_booking_id=bs.booking_id FROM booking_seats bs
 WHERE bs.show_seat_id=ss.show_seat_id AND bs.active AND ss.status='BOOKED';
ALTER TABLE show_seats ADD CONSTRAINT show_seats_available_owner CHECK(status <> 'AVAILABLE' OR current_booking_id IS NULL);
CREATE INDEX show_seats_current_booking_idx ON show_seats(current_booking_id) WHERE current_booking_id IS NOT NULL;

-- One row per simulated attempt: failed keys remain replayable after later success.
ALTER TABLE payments DROP CONSTRAINT payments_booking_id_key;
ALTER TABLE payments DROP CONSTRAINT payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK(status IN ('PENDING','SUCCESS','FAILED','REFUNDED'));
ALTER TABLE payments ADD COLUMN idempotency_key UUID;
ALTER TABLE payments ADD COLUMN requested_outcome VARCHAR(10) CHECK(requested_outcome IN ('SUCCESS','FAILED'));
ALTER TABLE payments ADD COLUMN refunded_at TIMESTAMPTZ;
CREATE UNIQUE INDEX payments_booking_request_unique ON payments(booking_id,idempotency_key);
CREATE UNIQUE INDEX payments_one_charge ON payments(booking_id) WHERE status IN ('SUCCESS','REFUNDED');

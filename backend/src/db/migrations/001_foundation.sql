CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE users (
 user_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 name VARCHAR(100) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE CHECK(email = lower(email)),
 phone_no VARCHAR(15) UNIQUE, password_hash VARCHAR(255) NOT NULL,
 role VARCHAR(10) NOT NULL DEFAULT 'USER' CHECK(role IN ('USER','ADMIN'))
);
CREATE TABLE movies (
 movie_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 title VARCHAR(100) NOT NULL, description TEXT, language VARCHAR(100) NOT NULL,
 release_date DATE NOT NULL, poster_url TEXT, duration_minutes INT NOT NULL CHECK(duration_minutes > 0), genre VARCHAR(255)
);
CREATE TABLE theatres (
 theatre_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 theatre_name VARCHAR(255) NOT NULL, location VARCHAR(255) NOT NULL
);
CREATE TABLE auditoriums (
 auditorium_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 theatre_id BIGINT NOT NULL REFERENCES theatres ON DELETE RESTRICT,
 audi_number INT NOT NULL CHECK(audi_number > 0), UNIQUE(theatre_id,audi_number)
);
CREATE TABLE seats (
 seat_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 auditorium_id BIGINT NOT NULL REFERENCES auditoriums ON DELETE RESTRICT,
 seat_number VARCHAR(10) NOT NULL, row VARCHAR(10) NOT NULL, "column" INT NOT NULL CHECK("column" > 0), seat_type VARCHAR(20) NOT NULL,
 UNIQUE(auditorium_id,seat_number), UNIQUE(auditorium_id,row,"column"), UNIQUE(seat_id,auditorium_id)
);
CREATE TABLE shows (
 show_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 movie_id BIGINT NOT NULL REFERENCES movies ON DELETE RESTRICT,
 auditorium_id BIGINT NOT NULL REFERENCES auditoriums ON DELETE RESTRICT,
 start_time TIMESTAMPTZ NOT NULL, end_time TIMESTAMPTZ NOT NULL,
 CHECK(start_time < end_time), UNIQUE(show_id,auditorium_id),
 EXCLUDE USING gist (auditorium_id WITH =, tstzrange(start_time,end_time,'[)') WITH &&)
);
CREATE TABLE show_seats (
 show_seat_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 show_id BIGINT NOT NULL, seat_id BIGINT NOT NULL, auditorium_id BIGINT NOT NULL,
 price NUMERIC(10,2) NOT NULL CHECK(price > 0),
 status VARCHAR(10) NOT NULL DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE','LOCKED','BOOKED')),
 locked_by BIGINT REFERENCES users ON DELETE RESTRICT, locked_until TIMESTAMPTZ,
 CHECK((status = 'LOCKED' AND locked_by IS NOT NULL AND locked_until IS NOT NULL) OR (status <> 'LOCKED' AND locked_by IS NULL AND locked_until IS NULL)),
 FOREIGN KEY(show_id,auditorium_id) REFERENCES shows(show_id,auditorium_id) ON DELETE RESTRICT,
 FOREIGN KEY(seat_id,auditorium_id) REFERENCES seats(seat_id,auditorium_id) ON DELETE RESTRICT,
 UNIQUE(show_id,seat_id), UNIQUE(show_seat_id,show_id)
);
CREATE TABLE offers (
 offer_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 code VARCHAR(100) NOT NULL UNIQUE, description TEXT,
 discount_type VARCHAR(10) NOT NULL CHECK(discount_type IN ('PERCENTAGE','FIXED')),
 discount_value NUMERIC(10,2) NOT NULL CHECK(discount_value > 0),
 valid_from TIMESTAMPTZ NOT NULL, valid_until TIMESTAMPTZ NOT NULL,
 CHECK(valid_from < valid_until), CHECK(discount_type <> 'PERCENTAGE' OR discount_value <= 100)
);
CREATE TABLE bookings (
 booking_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 show_id BIGINT NOT NULL REFERENCES shows ON DELETE RESTRICT,
 user_id BIGINT NOT NULL REFERENCES users ON DELETE RESTRICT,
 offer_id BIGINT REFERENCES offers ON DELETE RESTRICT,
 total_amount NUMERIC(10,2) NOT NULL CHECK(total_amount >= 0),
 status VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','CONFIRMED','CANCELLED','EXPIRED')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(booking_id,show_id)
);
CREATE TABLE booking_seats (
 booking_id BIGINT NOT NULL, show_seat_id BIGINT NOT NULL, show_id BIGINT NOT NULL,
 PRIMARY KEY(booking_id,show_seat_id),
 FOREIGN KEY(booking_id,show_id) REFERENCES bookings(booking_id,show_id) ON DELETE RESTRICT,
 FOREIGN KEY(show_seat_id,show_id) REFERENCES show_seats(show_seat_id,show_id) ON DELETE RESTRICT
);
CREATE TABLE payments (
 payment_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 booking_id BIGINT NOT NULL UNIQUE REFERENCES bookings ON DELETE RESTRICT,
 amount NUMERIC(10,2) NOT NULL CHECK(amount >= 0),
 payment_method VARCHAR(15) NOT NULL CHECK(payment_method IN ('CARD','UPI','NET_BANKING')),
 status VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SUCCESS','FAILED')),
 transaction_id VARCHAR(255) UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX shows_movie_start_idx ON shows(movie_id,start_time);
CREATE INDEX shows_start_idx ON shows(start_time);
CREATE INDEX show_seats_seat_idx ON show_seats(seat_id,auditorium_id);
CREATE INDEX bookings_user_idx ON bookings(user_id);
CREATE INDEX bookings_show_idx ON bookings(show_id);
CREATE INDEX bookings_offer_idx ON bookings(offer_id);
CREATE INDEX booking_seats_show_seat_idx ON booking_seats(show_seat_id,show_id);
CREATE INDEX show_seats_locked_by_idx ON show_seats(locked_by) WHERE locked_by IS NOT NULL;

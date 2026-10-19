# Schema and correctness decisions

Eleven domain tables: `users`, `movies`, `theatres`, `auditoriums`, `seats`, `shows`, `show_seats`, `bookings`, `booking_seats`, `payments`, `offers`. `schema_migrations` is runner metadata, not an extra domain entity. All generated identifiers are BIGINT GENERATED ALWAYS AS IDENTITY. Required relationships, monetary fields, statuses, offer ranges, and creation timestamps are NOT NULL. Statuses use CHECK constraints rather than PostgreSQL enums to keep later migrations simple. All foreign keys use RESTRICT; booking-related history has no cascading delete.

## Small adjustments from the supplied design

- `show_seats.auditorium_id` is deliberately redundant. Composite foreign keys `(show_id,auditorium_id)` and `(seat_id,auditorium_id)` make mismatched physical seats impossible, including under concurrent writes and parent updates. Supporting composite UNIQUE constraints are added to shows/seats.
- `booking_seats.show_id` is redundant for the same reason: composite foreign keys guarantee that a booking's show matches its ShowSeats. The requested composite primary key `(booking_id,show_seat_id)` remains.
- Unique `(auditorium_id,row,column)` prevents two seats occupying the same physical coordinate. Audi numbers and seat columns are positive.
- A lock-shape CHECK requires both lock owner/expiry only for LOCKED seats, and neither for other statuses. Locking APIs and expiration handling are outside M1.
- Emails must be lowercase in storage, with a UNIQUE constraint; registration also trims whitespace. Offers limit PERCENTAGE to 100, require positive discount values and ordered validity timestamps. Money uses NUMERIC(10,2), with positive seat prices and nonnegative booking/payment amounts.

## Scheduling and transactions

`btree_gist` allows a GiST exclusion constraint on `(auditorium_id WITH =, tstzrange(start_time,end_time,'[)') WITH &&)`. PostgreSQL rejects overlapping show intervals in the same auditorium even when concurrent transactions attempt inserts. `[)` allows a show to begin exactly when another ends. No implicit cleanup buffer or movie-runtime matching rule is invented; callers supply the intended interval.

Show creation locks its auditorium row, inserts a show and bulk-inserts ShowSeats from its physical layout in one transaction. Empty layouts roll back. API seat writes acquire the same auditorium lock and reject changes once shows exist, preventing a show/seat creation race from generating an incomplete inventory. Foreign keys provide invariant enforcement even outside the API; direct SQL scheduling must also populate inventory transactionally, as the seed does. Future booking code must lock the show row before booking creation, then the requested ShowSeat rows consistently; M1 show edits/deletes already lock the show row. Do not implement booking with a read-then-write availability check.

`show_seats` uniqueness prevents duplicated inventory. Do not put a global unique constraint on `booking_seats.show_seat_id`: cancelled/expired booking history may legitimately reference the same seat. Enforcing active ownership/payment state transitions belongs to M2 transactions. Payment booking ID is unique for the initial single-payment model; transaction ID is unique and nullable before payment exists.

## Indexes and timestamps

Primary/unique/exclusion constraints create their own indexes. Extra indexes support movie/start-time and date show searches, reverse seat references, booking-user/show/offer foreign keys, booking-seat references, and non-null lock owner references. Composite keys already cover theatre/auditorium and show-inventory lookups. Location/language scans are adequate for a small catalog; add search indexes only after measured need.

TIMESTAMPTZ stores instants; server connections use UTC and timestamp inputs require offsets. Show date filters explicitly use UTC day boundaries. PostgreSQL DATE is returned as a calendar string, avoiding local timezone conversion. IDs and money remain strings in JSON to avoid JavaScript precision loss. SQL values are parameterized; identifiers are selected only from server-owned definitions.

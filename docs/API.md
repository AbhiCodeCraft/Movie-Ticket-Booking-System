# REST API — M1 catalog and M2 bookings

Base path: `/api`. JSON requests. Successful responses use `{ "data": ... }`; lists also include `pagination: { page, limit, total }`. Errors use `{ "error": { "code", "message", "details"? } }`. Reads/updates/deletes return 200, creates 201; invalid input 400, unauthenticated 401, unauthorized 403, absent resources 404, constraint/business conflicts 409, auth rate limit 429, unexpected failures 500.

| Method | Path | Access / purpose |
|---|---|---|
| GET | `/health` (outside `/api`) | Live database readiness |
| POST | `/auth/register` | Public customer registration |
| POST | `/auth/login` | Public JWT login |
| GET | `/auth/me` | Authenticated profile |
| POST | `/auth/logout` | Authenticated; discard token client-side |
| GET | `/movies`, `/movies/:id` | Public movie catalog |
| GET | `/theatres`, `/theatres/:id` | Public theatre catalog |
| GET | `/auditoriums`, `/auditoriums/:id` | Public auditoriums |
| GET | `/seats`, `/seats/:id` | Public physical seats |
| GET | `/auditoriums/:id/seats` | Public paginated physical layout |
| GET | `/shows`, `/shows/:id` | Public show catalog/details |
| GET | `/shows/:id/seats` | Show-specific prices/status; no lock owner exposed |
| POST | `/movies`, `/theatres`, `/auditoriums`, `/seats`, `/shows` | ADMIN create |
| PATCH | Each above `/:id` | ADMIN partial update |
| DELETE | Each above `/:id` | ADMIN safe deletion subject to dependencies/history |

Send `Authorization: Bearer <access_token>` for authenticated calls. Roles/user IDs in request bodies are never authorization inputs. All write schemas reject unknown keys.

List pagination: `page=1&limit=20`, maximum limit 100. Filters: movies `language`; theatres `location`; auditoriums `theatre_id`; seats `auditorium_id`; shows `movie_id`, `auditorium_id`, `theatre_id`, `location`, `date=YYYY-MM-DD` (UTC). Language/location comparisons are case-insensitive exact matches. Unknown query fields are rejected; known filters irrelevant to the selected collection have no effect. Ordering is by primary key.

Registration body:
```json
{ "name": "Demo User", "email": "user@example.com", "password": "choose-a-strong-password", "phone_no": "+919876543210" }
```
`phone_no` may be omitted/null. Login takes email/password only and returns `access_token`, `token_type`, `expires_in`. Email is trimmed and lowercased; passwords are not trimmed.

Create movie:
```json
{ "title": "City Lights", "language": "Hindi", "release_date": "2026-10-01", "duration_minutes": 120, "genre": "Drama" }
```
Optional movie fields: `description`, `poster_url` (HTTP/HTTPS), `genre`.

Create theatre: `{ "theatre_name": "Central Cinema", "location": "Mumbai" }`.

Create auditorium: `{ "theatre_id": "1", "audi_number": 2 }`.

Create seat: `{ "auditorium_id": "2", "seat_number": "A1", "row": "A", "column": 1, "seat_type": "STANDARD" }`. Seat type is a nonempty string up to 20 characters; no unspecified enum is invented.

Create show (choose future timestamps):
```json
{ "movie_id": "1", "auditorium_id": "2", "start_time": "2030-01-01T12:00:00+05:30", "end_time": "2030-01-01T14:00:00+05:30", "price": "250.00" }
```
Price must be a positive fixed two-decimal string. The initial price applies to all seats; PATCH `price` changes all ShowSeats only while the show is future and unbooked. Show auditorium cannot be changed. Create physical seats before scheduling; a show in an empty auditorium is rejected and rolled back.

DELETE never cascades through booking history. Referenced movies/theatres/auditoriums/seats return 409. Future unbooked shows can be deleted with their generated ShowSeats in one transaction. Past shows or shows with any booking cannot be edited/deleted. Once any show exists in an auditorium, its physical seat layout is immutable through the API. Auditorium theatre IDs and seat auditorium IDs cannot be reassigned. These explicit M1 restrictions prevent accidental historical reinterpretation without adding a deactivation subsystem.

Seat availability derives from ShowSeats: `AVAILABLE`, `LOCKED` (temporarily held), or `BOOKED`. Expired LOCKED rows are projected as AVAILABLE without waiting for a worker. The endpoint never reveals the reservation identity or lock owner.

## M2 booking endpoints

All endpoints below require a Bearer token. Booking reads and payments are owner-only (403 for another user, including an administrator); cancellation permits the owner or ADMIN. No body accepts a user ID. JSON IDs are positive BIGINT **strings** throughout.

| Method | Path | Result |
|---|---|---|
| POST | `/shows/:showId/locks` | 201 for a new hold + pending booking; 200 for same-key replay |
| POST | `/bookings` | 200 acknowledgement of an existing, valid pending hold |
| GET | `/bookings?page=1&limit=20` | Owner's history, newest first; limit 1–100 |
| GET | `/bookings/:bookingId` | Booking, show/movie, theatre/auditorium, seats, price and payment attempts |
| GET | `/bookings/:bookingId/status` | Booking ID, effective status, payment status and expiry |
| POST | `/bookings/:bookingId/payments` | 200 simulated attempt, including a FAILED outcome |
| POST | `/bookings/:bookingId/cancel` | 200 cancellation; repeats return existing cancelled state |

### Reserve and acknowledge

`POST /api/shows/1/locks`

```http
Authorization: Bearer <token>
Idempotency-Key: 37f3ce60-63f2-4160-ae13-a47b825a681f
Content-Type: application/json
```

```json
{ "seatIds": ["101", "102"] }
```

IDs are `show_seat_id` values from availability, **not** `seat_id`. Select 1–20 distinct seats from the specified show. Selection is all-or-nothing. A valid existing hold conflicts even for the same owner unless this is the same idempotency key and selection. Wrong-show seats return 400, missing seats/show 404, unavailable seats 409.

Response excerpt (the actual response also contains movie, theatre and auditorium fields):

```json
{
  "data": {
    "booking_id": "42",
    "show_id": "1",
    "hold_id": "466c94ab-af76-4db8-b88c-0b0bed2100f5",
    "status": "PENDING",
    "total_amount": "500.00",
    "created_at": "2026-10-19T10:00:00.000Z",
    "expires_at": "2026-10-19T10:05:00.000Z",
    "payment_status": "UNPAID",
    "payments": [],
    "seats": [
      { "show_seat_id": "101", "price": "250.00", "seat_number": "A1", "row": "A", "column": 1, "seat_type": "STANDARD" },
      { "show_seat_id": "102", "price": "250.00", "seat_number": "A2", "row": "A", "column": 2, "seat_type": "STANDARD" }
    ]
  }
}
```

Optional `POST /api/bookings`:

```json
{ "holdId": "466c94ab-af76-4db8-b88c-0b0bed2100f5" }
```

Hold acquisition already created the pending booking to avoid a second permanent reservation entity and eliminate a hold-to-booking transition gap. This acknowledgement returns that same booking while it is pending and valid; expired/cancelled/confirmed holds return 409. Clients can go directly from the hold response to payments. Hold keys are unique per user; same key + same show and unordered selection returns the original booking's **current** state without renewal, even if expired. Reusing a key for another selection returns 409. To book again after expiry/cancellation use a new key.

### Simulate payment

`POST /api/bookings/42/payments`, using a UUID `Idempotency-Key` scoped to this booking:

```json
{ "payment_method": "UPI", "outcome": "SUCCESS" }
```

Methods: `CARD`, `UPI`, `NET_BANKING`; outcomes: `SUCCESS`, `FAILED`. Unknown fields (including amount, card number, CVV, or user ID) are rejected. Production returns 403 `SIMULATION_DISABLED` for valid payment requests. No gateway/network request or artificial delay is involved.

Response: `{ "data": { "booking": { ... }, "payment": { "payment_id", "booking_id", "amount", "payment_method", "status", "transaction_id", "idempotency_key", "requested_outcome", "created_at", "refunded_at" }, "replayed": false } }` (field names describe the shape).

The server charges the booking's SQL-calculated snapshot total. SUCCESS atomically records payment, confirms the booking and marks all associated inventory BOOKED. FAILED records an attempt and leaves the hold pending until its original deadline. A new attempt needs a new key. Replaying the same key/method/outcome returns its recorded attempt (`replayed: true`), even after a later attempt succeeds. Changing parameters with the same key returns 409. After confirmation, a new key returns 409; it cannot create a second charge. A replay after cancellation shows the successful attempt's current REFUNDED status and the CANCELLED booking; it never reconfirms.

### Cancel, expiry and retries

`POST /api/bookings/42/cancel` with `{}` releases only seats still pointing to that booking. Before show start, PENDING can become CANCELLED without a refund; CONFIRMED becomes CANCELLED with a full simulated refund (payment status REFUNDED and `refunded_at`). Repeated cancellation returns 200 with the existing state, without another operation/refund. EXPIRED bookings and new cancellation after show start return 409. Old cancelled/expired history does not block rebooking.

Availability and history compute expiry from PostgreSQL time. Detail/status/write transactions also persist EXPIRED and release expired inventory for the show. No background process is needed. An old hold UUID cannot affect a new hold, even when both belong to the same user.

Contention/deadlock/serialization/statement timeouts return 409 `RETRYABLE_CONFLICT`. Retry with the **same** key after a short delay (or after a lost HTTP response). The backend rolls back and does not blindly retry transactions internally. Ordinary `BOOKING_CONFLICT` means the state/ownership prevents that operation. Unrecognized booking/hold IDs return 404; malformed IDs/keys/inputs return 400.

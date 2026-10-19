# M1 REST API

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

Seat availability is the stored ShowSeat `status`, not the physical seat. M1 never creates locks/bookings and does not infer lock expiry; expiry and reservation concurrency will be implemented in the later booking milestone.

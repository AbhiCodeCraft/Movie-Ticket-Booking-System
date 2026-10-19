# Movie Ticket Booking System — M2

Express + JavaScript modular monolith, explicit `pg` SQL, PostgreSQL 17, JWT/bcrypt authentication, catalog management, and a transactional booking engine. M2 adds temporary holds, pending bookings, simulated payments, cancellation/refunds, and booking history. No Redis, workers, real payment gateway, or frontend implementation.

## Setup (Windows PowerShell, macOS, Linux)

Use Node.js 24 LTS, npm, and Docker Desktop/Engine with Compose. Express 5 supports Node 18+, but use a supported Node LTS for development/deployment. Start Docker first. Run these commands from the repository root:

```sh
node backend/scripts/setup-env.js
docker compose up -d --wait
cd backend
npm ci
npm run migrate
npm run seed
npm start
```

`setup-env.js` generates random secrets in root `.env` (Compose) and `backend/.env` (application). It refuses to overwrite either file. This workspace already has those generated files; skip setup-env here. Templates are provided for manual configuration. Keep the database password consistent between the two files; changing it does not reset an existing PostgreSQL volume's password.

This workspace also has an ignored project-local Node 24.22.0 runtime for verification. To use it in PowerShell, from `backend`, run `$env:Path = (Resolve-Path '..\.local\node_modules\node\bin').Path + ';' + $env:Path` before npm commands. This does not change the system Node installation. For a fresh clone, install Node 24 LTS normally.

API: `http://localhost:3000`; `GET /health` performs a database query. PowerShell: `Invoke-RestMethod http://localhost:3000/health`. Standard shell: `curl http://localhost:3000/health`. Use `npm run dev` for watch mode. Stop the backend with Ctrl+C. `docker compose stop` retains database data.

PostgreSQL can also run natively: create a database, set `DATABASE_URL` and ensure the migration user may install `btree_gist`. Docker binds PostgreSQL to localhost port **5433**; its credentials are development-only. Production should use a dedicated restricted application role, a separate migration role, TLS-verified database connections, HTTPS ingress, and externally supplied secrets. Do not deploy the Compose superuser as your application role. CORS uses an explicit origin allowlist, empty by default; production origins must be HTTPS. Proxy trust is disabled; configure a specific trusted proxy only when deploying behind one.

## Development administrator

Public registration always creates USER. Admin seeding is allowed only with `NODE_ENV=development`, requires supplied credentials, and refuses an existing email instead of promoting it.

PowerShell, from `backend`:

```powershell
$env:ADMIN_EMAIL = 'your-admin@example.com'
$env:ADMIN_NAME = 'Development Admin'
$env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', (Read-Host 'Admin password (12–72 UTF-8 bytes)' -AsSecureString)).Password
npm run seed:admin
Remove-Item Env:ADMIN_PASSWORD
```

POSIX shell: set `ADMIN_EMAIL`, `ADMIN_NAME`, and `ADMIN_PASSWORD` in the environment, then `npm run seed:admin`; unset the password afterwards. No administrator password is stored in source or seed data.

## Tests

From `backend`:

```sh
npm test
```

Tests use Node's built-in test runner and Supertest against **real PostgreSQL**. They connect to the maintenance `postgres` database through `TEST_ADMIN_URL` (or `DATABASE_URL`), create random `ticket_m1_test_<24 hex digits>` and `ticket_m2_test_<24 hex digits>` databases, run API/database tests, then drop only those newly created databases. The configured development database is never migrated, truncated, or deleted by tests. The test role needs CREATEDB and `btree_gist` privileges. The provided Docker role has these. If the process is forcibly killed, a disposable test database may remain; inspect and remove only that matching database manually. Missing PostgreSQL is a test failure, not a skipped integration suite. M1 tests exercise fresh initialization; M2 tests also upgrade populated M1 history, and use up to 25 separate connections for contention tests.

## Migrations and seed

`npm run migrate` applies ordered SQL files under `src/db/migrations`. The lightweight runner serializes execution with an advisory lock, wraps each migration in a transaction, and records its SHA-256 checksum in `schema_migrations`. Repeat runs do nothing; editing an applied migration is rejected. Add a new numbered SQL file for changes. There are no automatic destructive down migrations; use a new migration or restore a backup.

`npm run seed` is development-only and transactionally creates two movies, one Mumbai theatre, one auditorium, 18 physical seats, two shows seven days ahead at 12:00/15:00 UTC, and 36 show seats priced at 250.00. It is repeat-safe, using the `M1 Demo Cinema` marker plus an advisory lock; it does not continuously move existing sample shows into the future. Use admin APIs to schedule new shows later.

## Structure

```text
backend/src/
  app.js, server.js       HTTP app factory and process lifecycle
  config/                validated environment
  db/                    SQL migrations, runner, transactions, seeds, type parsing
  middleware/            authentication/authorization and centralized errors
  modules/auth/          routes, controller, service, validation
  modules/users/         user SQL repository
  modules/catalog/       shared routes/controller/service/repository for simple CRUD
  modules/movies/         movie schema/metadata
  modules/theatres/       theatre schema/metadata
  modules/auditoriums/    auditorium schema/metadata
  modules/seats/          physical seat schema/metadata
  modules/shows/          schema plus scheduling service and ShowSeat repository
  modules/bookings/       hold lifecycle, history, validation and transaction coordination
  modules/payments/       simulated attempts, confirmation and cancellation/refunds
  modules/offers/         M1 schema-only note
  utils/                 typed HTTP errors
backend/tests/           isolated PostgreSQL integration suite
frontend/                empty placeholder for a later milestone
docs/                    API and schema decisions
```

Simple catalog modules share the same four responsibility layers rather than duplicate identical CRUD functions. Show-specific transactions live in their own service/repository. All client values use SQL parameters; dynamic identifiers come only from server-owned definitions and strict Zod schemas. BIGINT IDs and NUMERIC prices are JSON strings; calendar DATE values remain `YYYY-MM-DD`. Show timestamps require explicit offsets; date filtering uses UTC calendar days. A single database statement keeps pagination totals and rows on the same snapshot.

See [API endpoints and examples](docs/API.md) and [database decisions](docs/DATABASE.md).

Authentication uses short-lived HS256 JWTs (15 minutes by default, maximum 1 hour), fixed issuer/audience and database lookup for current user/role on each authenticated request. Logout tells the client to discard its token; already issued tokens remain usable until expiry. There is no token blacklist or refresh-token subsystem in M1. Passwords use bcrypt cost 12 with a 72-byte maximum. Authentication requests have an in-memory per-process rate limit. Logs exclude bodies and authorization headers. Unexpected errors are logged server-side and never expose SQL details in API responses.

## Booking workflow

1. Log in and fetch `/api/shows/:id/seats`. IDs for reservations are **show_seat_id strings**, not physical seat IDs.
2. `POST /api/shows/:id/locks` with `{ "seatIds": ["101", "102"] }` and a new UUID `Idempotency-Key`. This atomically creates the hold **and its PENDING booking** with snapshotted prices; save `booking_id`, `hold_id`, and `expires_at`.
3. Optionally acknowledge the pending booking with `POST /api/bookings` and `{ "holdId": "<returned UUID>" }`. It never creates a second booking or extends the deadline.
4. `POST /api/bookings/:id/payments` with a payment-attempt UUID key and `{ "payment_method": "UPI", "outcome": "SUCCESS" }`. `FAILED` simulates a declined attempt without extending the hold. Use a new key for a genuinely new attempt; use the same key to retry a lost response.
5. View `/api/bookings`, `/api/bookings/:id`, or `/api/bookings/:id/status`. Cancel before show start with `POST /api/bookings/:id/cancel` and `{}`.

`HOLD_TTL_SECONDS=300` defaults to five minutes (valid range 1–900); expiry is capped at show start. PostgreSQL locks serialize booking operations within a show; different shows can proceed independently. Expired locks are available immediately by deadline, even with no cleanup worker. Pending records are lazily marked EXPIRED when a transaction next touches their show; history and availability expose logical expiry immediately. Abandoned holds remain auditable expired bookings.

Simulation is enabled only in `NODE_ENV=development` or `test`; production payment requests return 403. No card details are accepted. A successful payment and confirmation commit together. Confirmed cancellation records a full simulated REFUNDED payment and releases seats in the same transaction; no external money moves. See [the lifecycle and concurrency rules](docs/DATABASE.md#m2-lifecycle-and-concurrency) and [complete booking API contracts](docs/API.md#m2-booking-endpoints).

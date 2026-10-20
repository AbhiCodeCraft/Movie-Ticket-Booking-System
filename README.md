# Frame Cinema — Movie Ticket Booking System

A working full-stack cinema booking application built for SDE placement preparation. Browse films, choose a screening and seats, complete a simulated payment, and manage bookings. Administrators configure the catalog, auditoriums, seat grids, and shows through the same application.

**M1:** database, authentication and catalog. **M2:** transactional booking engine. **M3:** React UI, Docker integration and browser verification. M4 is optional future work; the application needs no Redis or worker to remain correct.

## Features

- Searchable movie catalog, movie details, location/date screening filters, local poster artwork, and responsive dark UI.
- Customer registration/login/logout, protected routes, role-based administration, and expired-session recovery.
- Interactive seat selection with available/held/booked/selected states, precise price display, and conflict recovery.
- Five-minute configurable holds, checkout countdown, idempotent simulated payment attempts, confirmed tickets, history, cancellation, and simulated refunds.
- Admin movie/theatre/auditorium/seat/show CRUD, practical seat-grid generation, and authorized cancellation by booking reference.
- PostgreSQL constraints, explicit SQL, versioned migrations, deterministic row locking and isolated integration tests.

## Stack and architecture

React 19, Vite 8, Tailwind CSS 4, React Router, Fetch and Lucide; Node.js 24, Express 5, `pg`, PostgreSQL 17, Zod, bcrypt and JWT. Tests use Node's test runner, Supertest, Vitest/Testing Library, and Playwright Chromium.

```text
Browser: React application
          |
          | same-origin /api requests
          v
Nginx (Docker :8080) or Vite (development :5173)
          |
          v
Express modular monolith (:3000 inside Docker)
          |
          | parameterized SQL + short transactions
          v
PostgreSQL 17 (persistent volume)
```

Backend modules separate routes, controllers, services and SQL repositories. Simple catalog modules share CRUD infrastructure; booking and payment transactions have dedicated modules. Frontend `api/`, `contexts/`, `hooks/`, `components/`, `layouts/`, `pages/` and `utils/` separate transport, session state and screens. The frontend loads paginated catalog collections for local filtering; this is intentionally suitable for a small portfolio catalog.

## Quick start — Docker only

Install/start Docker Desktop or Docker Engine with Compose. No host Node installation is required.

**First clone only**, generate ignored random credentials from the repository root (works in PowerShell and standard shells):

```sh
docker run --rm -v "${PWD}:/workspace" -w /workspace node:24-bookworm-slim node backend/scripts/setup-env.js
```

The current workspace already has environment files; skip this command here. It refuses to overwrite existing credentials. Templates are `.env.example` and `backend/.env.example`. Root `.env` must contain `POSTGRES_PASSWORD` and `JWT_SECRET`; if upgrading an M1/M2 checkout, add its existing backend JWT secret to root `.env`. Never commit either secret. Generated database passwords use URL-safe hex.

Start everything:

```sh
docker compose up --build -d --wait
```

- **Frontend:** http://localhost:8080
- **Backend health:** http://localhost:3001/health
- **Backend API:** http://localhost:3001/api
- **PostgreSQL:** localhost:5433

Compose waits for PostgreSQL, applies migrations under the existing migration lock, loads repeat-safe demo data in development mode, starts Express, then Nginx. The browser only calls `/api` on its own origin; it never calls a Docker-only hostname. Port 3001 avoids conflicting with an optional host development backend on port 3000.

```sh
docker compose logs -f backend frontend
docker compose exec backend node src/db/migrate.js
docker compose exec backend node src/db/seeds/demo.js
docker compose stop
```

`stop` preserves the existing database volume. Restart with `docker compose up -d --wait`. Demo seed creates six fictional movies with local artwork, three theatres, 120 seats and 63 screenings across seven days. Repeated startup does not duplicate or move those records. Schedule new shows through the admin UI when demo dates pass. Set `SEED_DEMO=false` in root `.env` to disable automatic demo seeding. The original M1 seed is retained for regression fixtures.

**Destructive reset — deletes ALL project database data, including bookings:** only if intentionally resetting the local demo, run `docker compose down -v`, then `docker compose up --build -d --wait`. This command was not used during implementation.

## Create your development administrator

No default admin password is embedded or automatically created. Public signup creates USER accounts only. Set your own credentials and invoke the existing development-only seed. It refuses to promote an existing customer email.

PowerShell, from the project root:

```powershell
$env:ADMIN_EMAIL = 'your-admin@example.com'
$env:ADMIN_NAME = 'Development Admin'
$env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', (Read-Host 'Admin password (12–72 UTF-8 bytes)' -AsSecureString)).Password
docker compose exec -e ADMIN_EMAIL -e ADMIN_NAME -e ADMIN_PASSWORD backend node src/db/seeds/admin.js
Remove-Item Env:ADMIN_PASSWORD
```

Bash:

```bash
export ADMIN_EMAIL='your-admin@example.com' ADMIN_NAME='Development Admin'
read -rsp 'Admin password: ' ADMIN_PASSWORD; echo
export ADMIN_PASSWORD
docker compose exec -e ADMIN_EMAIL -e ADMIN_NAME -e ADMIN_PASSWORD backend node src/db/seeds/admin.js
unset ADMIN_PASSWORD
```

Sign in normally, then open **Studio admin**. Use a unique administrator email and at least 12 password characters, with at most 72 UTF-8 bytes.

## Optional manual development

Use Node 24.15 or newer on the Node 24 LTS line. This workspace also has an ignored local Node 24.22 runtime; the system installation was not changed.

```sh
docker compose up -d db
cd backend
npm ci
npm run migrate
npm run seed
npm run dev
```

In a second terminal:

```sh
cd frontend
npm ci
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to localhost:3000. Override `API_PROXY_TARGET` for a different backend; `VITE_API_BASE` defaults to `/api`. Backend configuration comes from `backend/.env`; Compose uses root `.env`. For demo data manually: from `backend`, run `node --env-file=.env src/db/seeds/demo.js`.

## Run tests

Backend integration tests can run entirely inside Docker:

```sh
docker compose exec -T backend node --test --test-concurrency=1
```

Or from `backend`: `npm test`.

Frontend tests and production build, from `frontend` with Node 24:

```sh
npm ci
npm test
npm run build
```

Browser tests require frontend and backend dependencies installed and PostgreSQL running. From `frontend`:

```sh
npx playwright install chromium
npm run test:e2e
```

The browser runner loads `backend/.env`, creates a random disposable PostgreSQL database, migrates/seeds it, starts an isolated Express server at 127.0.0.1:3100 and Vite at 127.0.0.1:5174, runs Playwright, then removes only its test database and stops its servers. Keep those two ports free. Browser tests are not run against your development database. Tests require a role with CREATEDB and extension privileges; the local Docker role has them. `TEST_ADMIN_URL` can specify a separate test server. If forcibly killed, inspect leftover `ticket_m*_test_*` / `ticket_m3_e2e_*` databases before manually removing any.

See [verification results](docs/VERIFICATION.md) for actual test counts and commands run. Screenshots in [docs/screenshots](docs/screenshots) come from the real application, not generated UI mockups.

## Demo walkthrough

**Customer:** Create an account → choose a movie → choose a screening → select seats → Reserve seats → checkout → choose a successful simulation → see the backend-confirmed ticket. Open My bookings, cancel with confirmation, and observe CANCELLED / REFUNDED. For a declined attempt choose the FAILED outcome, then retry successfully before the same hold deadline.

**Admin:** Sign in with your provisioned administrator → Studio admin → create a movie and theatre → create an auditorium → use Seats / Generate a seat grid → schedule a future show with its price. Open a separate customer session to find and reserve that screening. Show intervals cannot overlap; seats become immutable after scheduling, and booking history prevents destructive edits/deletion. Grid generation saves individual seats and explicitly reports partial progress on failure.

**Concurrency:** Two different browser profiles select the same currently available seat. The first reservation succeeds; the second sees a conflict and refreshed availability. Holds expire logically without any worker. Backend transactions remain authoritative, even if a page's countdown or availability display is stale.

## Database and correctness

Eleven domain entities: users, movies, theatres, auditoriums, seats, shows, show seats, bookings, booking seats, payments and offers. Identity BIGINT keys are returned as strings. Money uses PostgreSQL NUMERIC; the frontend sums display amounts using integer cents. Composite foreign keys keep seats and bookings in the correct show/auditorium. A GiST exclusion constraint prevents overlapping screenings.

Every booking operation locks its show, then relevant booking/inventory rows in deterministic order. Atomic multi-seat holds create the pending booking and snapshot prices. Unique reservation identities prevent stale same-user requests from acting on replacement holds. Payment attempts have durable idempotency keys; success and confirmation commit together. A partial unique index prevents multiple active owners. Cancellation preserves history and atomically releases seats and records a simulated refund. PostgreSQL's clock decides expiry after lock waits; no background worker is needed.

Migrations 001 and 002 are unchanged by M3. Applied migrations have tracked checksums and must not be edited. [Database decisions](docs/DATABASE.md) explain constraints, lock order, migration compatibility and tradeoffs. [API documentation](docs/API.md) covers request/response contracts.

## Authentication and payment boundaries

The browser stores its short-lived JWT in **sessionStorage**, not an HttpOnly cookie. This survives refresh in the current tab and supports checkout recovery, but JavaScript/XSS can access it. Do not inject untrusted HTML; React renders text, backend validation is authoritative, and secrets never enter the frontend build. The session is cleared on logout or HTTP 401. Logout discards the token; the stateless server token remains valid until expiry. There is no refresh-token or revocation subsystem.

Pending payment identifiers are also stored per user/booking in sessionStorage so lost-response retries reuse the same key. A refreshed page reads backend state before offering payment. Client countdowns are informational; server timestamps/status determine validity. Dates/times are shown in the browser's timezone, including local date filters and admin datetime inputs (converted to ISO offsets for the API).

Compose is an explicitly local **development/demo** deployment. Payment simulation is enabled only for development/test; it never collects real payment credentials. `/api/config` reports whether simulation is enabled, and production rejects payment simulation regardless of UI state. Production deployment would additionally need HTTPS, restricted database roles, managed secrets, suitable rate limiting/proxy configuration, and a real payment workflow; these are not claimed here.

## Known limits and future work

- No real money, email notifications, QR admission scanner, or global admin booking-history browser. Admin cancellation by reference uses existing authorization.
- Catalog/admin lists are loaded from paginated APIs and filtered locally; booking filters apply to the displayed page. These choices keep the portfolio implementation small.
- Holds are lazily persisted as EXPIRED; read availability computes expiry immediately. No scheduled cleanup is required for correctness.
- Demo films/artwork are fictional. Admin movie forms accept external HTTP/HTTPS poster URLs; failed images have a local fallback.
- Planned M4 enhancements: Redis caching, expiration cleanup worker, stronger distributed rate limiting, observability, load testing and multi-instance deployment. None is a runtime dependency of this version.

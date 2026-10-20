# Verification — M1, M2 and M3

## M3 — 2026-10-20

Environment: Windows PowerShell, project-local Node 24.22.0, Docker PostgreSQL 17, Chromium via Playwright. Existing M1/M2 data and volume were retained.

- Backend: `docker compose exec -T backend node --test --test-concurrency=1`: **65 passed, 0 failed, 0 skipped**. Real isolated PostgreSQL integration suites ran, including all 64 M1/M2 tests and the public configuration regression.
- Frontend: `npm test` (executed with local Node 24 and `node_modules/vitest/vitest.mjs run`): **14 passed, 0 failed**.
- Browser: from backend, local Node 24 `--env-file=.env scripts/e2e.js` (equivalent to frontend `npm run test:e2e`): **8 passed, 0 failed**. Runner created a randomly named PostgreSQL database, applied migrations, seeded catalog and a generated admin, ran Express/Vite and Chromium, then dropped only its own test database.
- Browser journeys: registration/login; reserve/pay/confirmation/history/cancel/refund; two-customer conflict; server-expired hold; failed payment followed by success; lost successful response and refresh without double charge; full admin screening setup followed by customer reservation; authorization/session recovery; desktop/mobile rendering. Database assertions verify persisted outcomes.
- Earlier browser failures exposed fixture timing/numbering issues and inaccessible admin select names. These were fixed before the final passing run.
- Production build: `npm run build` passed on Windows and during the Docker multi-stage build.
- `docker compose up --build -d --wait` passed; PostgreSQL, Express and Nginx all healthy. Repeated startup kept existing data and reused demo seed records.
- Live HTTP checks returned 200 for frontend `/`, SPA `/movies`, proxied `/api/movies`, `/api/config`, `/posters/0.svg`, and backend `/health`.
- Actual browser screenshots are in `docs/screenshots/`; mobile catalog and desktop seat selection were visually inspected. Browser checks assert no horizontal overflow, failed poster decoding or uncaught page errors.

Payments/refunds are simulation only. This is local integration verification, not production load, security or real-payment certification. No M4 infrastructure was added.

## M2 — 2026-10-19

Environment: Windows PowerShell, Node **24.22.0**, npm **10.8.1**, Docker PostgreSQL **17**. No new npm dependencies were needed.

- `npm test`: **64 passed, 0 failed, 0 skipped** (34 M2 tests plus all 30 original M1 tests, unchanged). Both suites used real isolated PostgreSQL databases and removed their own databases after completion.
- Fresh initialization was tested by M1's suite. M2's suite first populated migration 001 with existing confirmed booking/payment/seat history, then applied migration 002 twice and verified preservation/backfills.
- `npm run migrate` applied migration 002 to the existing development database; a second run succeeded without reapplying changes. Migration 001 was not changed.
- Concurrency A: two users / one seat, exactly one holder.
- Concurrency B: 20 distinct users / one seat, exactly one holder and one booking.
- Concurrency C: overlapping two-seat selections, exactly one complete selection and no partial reservation.
- Concurrency D: 12 simultaneous same-key payment requests produced one payment ID; eight distinct-key requests produced one charge and seven conflicts. Eight same-key holds produced one booking without extending expiry.
- Concurrency E: payment and acquisition were deliberately blocked on a show row; expiry was moved into the past before releasing them. The stale payment failed and the replacement hold survived. No long timing sleep was used.
- Concurrency F: cancellation versus acquisition and cancellation versus payment preserved single ownership and consistent refunds. Same-user ABA reacquisition was also verified.
- A real held database lock exercised the 3-second timeout, safe 409 response, rollback, and successful same-key retry. An injected PostgreSQL confirmation failure proved that payment insertion, active associations and inventory mutations all roll back together.
- Other checks covered exact decimal price snapshots, expired availability without cleanup, owner privacy, production simulation denial, failed-attempt replay, history, cancellation/rebooking, active-owner uniqueness, show-start rejection, and admin mutation protection.
- `npm start`: the identified old M1 server was restarted with M2 on port 3000. Startup logging now reports listening only after a successful bind.
- Live HTTP smoke verification on the running server: health -> register/login -> hold two seats -> acknowledge -> FAILED payment -> SUCCESS -> replay -> cancel -> REFUNDED -> history. Total was **500.00**, both seats returned to AVAILABLE, and cancelled history remained. This intentionally leaves one cancelled demonstration booking and its attempt history in the development database; no development records were deleted.
- `git diff --check` passed. The backend and PostgreSQL were left running for local use.

These results cover the tested database/API invariants, not a production traffic or real-payment certification. No Redis, background infrastructure, external gateway, frontend, or notifications were added.

## M1 — 2026-10-19

Environment: Windows PowerShell; system Node 20.16.0/npm 10.8.1; final verification used project-local Node **24.22.0**; Docker PostgreSQL **17**.

- `docker compose up -d --wait`: PostgreSQL container healthy.
- `npm run migrate`: schema applied; repeated execution succeeded without reapplying SQL.
- `npm run seed`: sample catalog loaded; repeated execution succeeded without duplicates.
- `npm test` using Node 24: **30 passed, 0 failed, 0 skipped**. Real PostgreSQL integration tests ran in a randomly created disposable database, which was dropped afterwards.
- Tests include registration/login, bcrypt, JWT expiry/audience checks, duplicate email, role enforcement, development-only admin seed, catalog/admin CRUD, pagination/filtering, safe errors, database constraints, concurrent overlapping inserts, show inventory, concurrent seat writes/scheduling, immutable history, and migration checksums.
- `npm start`: backend started on port 3000. Live HTTP checks returned 200 for `/health`, movies, shows, and show seat availability; seeded inventory contained 18 seats per show.
- Dependency installation reported zero audit vulnerabilities. `git diff --check` passed.

Earlier M1 runs found a Windows test-discovery incompatibility and malformed-ID validation error; both were fixed before the passing final run. At that milestone, no booking/payment/locking APIs or frontend were implemented. Graceful shutdown handlers are implemented; a process interrupt stopped the smoke-test server, but OS-specific signal/drain behavior was not separately load-tested.

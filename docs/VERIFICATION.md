# M1 verification — 2026-10-19

Environment: Windows PowerShell; system Node 20.16.0/npm 10.8.1; final verification used project-local Node **24.22.0**; Docker PostgreSQL **17**.

- `docker compose up -d --wait`: PostgreSQL container healthy.
- `npm run migrate`: schema applied; repeated execution succeeded without reapplying SQL.
- `npm run seed`: sample catalog loaded; repeated execution succeeded without duplicates.
- `npm test` using Node 24: **30 passed, 0 failed, 0 skipped**. Real PostgreSQL integration tests ran in a randomly created disposable database, which was dropped afterwards.
- Tests include registration/login, bcrypt, JWT expiry/audience checks, duplicate email, role enforcement, development-only admin seed, catalog/admin CRUD, pagination/filtering, safe errors, database constraints, concurrent overlapping inserts, show inventory, concurrent seat writes/scheduling, immutable history, and migration checksums.
- `npm start`: backend started on port 3000. Live HTTP checks returned 200 for `/health`, movies, shows, and show seat availability; seeded inventory contained 18 seats per show.
- Dependency installation reported zero audit vulnerabilities. `git diff --check` passed.

Earlier runs found a Windows test-discovery incompatibility and malformed-ID validation error; both were fixed before the passing final run. No booking/payment/locking APIs or frontend were implemented. Graceful shutdown handlers are implemented; a process interrupt stopped the smoke-test server, but OS-specific signal/drain behavior was not separately load-tested.

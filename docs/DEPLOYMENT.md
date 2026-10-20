# Public portfolio deployment: Vercel + Render + Neon

M3.5 prepares a **single-instance simulated booking demo**, not a real cinema or payment service. No cloud resources have been created, deployed or charged by this work. Use separate cloud credentials/data from the local Docker database.

## 1. Publish your repository

Create an empty GitHub repository. Review `git status`, tracked files and `.gitignore` before publishing. Do not add `.env`, `.env.*` secrets, `node_modules`, logs, database dumps or build output. `.env.example` files contain placeholders only.

From the repository root (PowerShell or Bash), substitute your repository URL:

```sh
git remote add origin https://github.com/YOUR-ACCOUNT/YOUR-REPOSITORY.git
git push -u origin master
```

If `origin` already exists, inspect `git remote -v` rather than replacing it blindly. This repository currently uses `master`; select your actual branch in hosting dashboards. No push was performed during this audit.

## 2. Create Neon PostgreSQL

Create a Neon project/database in a region near your Render backend. Keep production/demo and development in separate projects or branches. In **Connect**, copy the **direct (unpooled)** connection string into your secret manager. Use the PostgreSQL role that owns this demo schema and can install `btree_gist`; migration 001 requires it.

Recommended for this small service: use the **direct URL for both `DATABASE_URL` and `MIGRATION_DATABASE_URL`**, with `sslmode=verify-full`. The Node pool defaults to five connections. Never paste a real connection string into source, tickets, screenshots or public documentation.

The connection helper enforces certificate and hostname verification for `*.neon.tech`, normalizing Neon's `sslmode=require` to `verify-full`. It rejects conflicting TLS options. Do not set `NODE_TLS_REJECT_UNAUTHORIZED=0`, `sslmode=no-verify`, or `rejectUnauthorized:false`. A certificate error must be investigated, not bypassed.

Optional: `DATABASE_URL` may use Neon's pooled hostname; keep `MIGRATION_DATABASE_URL` direct. Booking operations acquire a client, `BEGIN`, use row locks and `SET LOCAL` timeouts, commit/rollback and release it. These locks remain inside one transaction and are compatible with transaction pooling. The demo seed also uses a transaction advisory lock. **Migrations use a session advisory lock across multiple transactions**, so the CLI explicitly rejects a `-pooler` hostname. The runtime does not rely on session `SET`, temporary tables or named prepared statements.

See [Neon connection guidance](https://github.com/neondatabase/website/blob/main/content/docs/connect/connection-errors.md) and [node-postgres TLS configuration](https://node-postgres.com/features/ssl).

## 3. Create the Render backend

Create a **Web Service**, connect the repository and select:

| Setting | Value |
| --- | --- |
| Root directory | `backend` |
| Runtime | Node |
| Node version | `24.22.0` via `NODE_VERSION` |
| Build command | `npm ci --omit=dev` |
| Start command | `npm run migrate && exec node --env-file-if-exists=.env src/server.js` |
| Health check | `/health` |
| Instances | 1 |

The start command runs the existing migration script before the exact Node command used by `npm start`. `exec` replaces the shell so Node receives shutdown signals directly. If migration fails, the server does not start. No seed runs at Render startup. On plans supporting pre-deploy commands, you may instead use `npm run migrate` as the pre-deploy command and `node --env-file-if-exists=.env src/server.js` as the start command.

The server binds to `0.0.0.0` and Render's supplied `PORT`. Do not hardcode a host port or configure a PostgreSQL container on Render. `/health` checks the database. The backend stores no uploads or application state on ephemeral disk.

Set these backend environment variables:

| Variable | Value / purpose |
| --- | --- |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `24.22.0` |
| `DATABASE_URL` | Neon URL, preferably direct for this small demo |
| `MIGRATION_DATABASE_URL` | Neon **direct** URL; required when runtime URL is pooled |
| `JWT_SECRET` | Independently generated random secret, at least 32 characters |
| `JWT_TTL_SECONDS` | `900` |
| `HOLD_TTL_SECONDS` | `300` |
| `PAYMENT_MODE` | Explicitly `demo` for this portfolio; otherwise `disabled` |
| `DB_POOL_MAX` | `5` |
| `CORS_ORIGINS` | Exact Vercel HTTPS origin, no trailing slash or path |
| `TRUST_PROXY_HOPS` | `1` for the documented single managed ingress; verify below |

`PORT` is supplied by Render. `SEED_DEMO` is a local Docker startup option and is unnecessary here. Generate a JWT secret locally with `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"` and copy it directly into Render's secret field; do not save it to Git.

Initially leave `CORS_ORIGINS` empty if the frontend URL is not yet assigned. Health and non-browser checks still work; browser requests with an Origin will be denied. Add the assigned Vercel origin before the live walkthrough. Multiple approved origins are comma-separated; do not use wildcards or indiscriminately allow all preview deployments.

Proxy trust is bounded, not `true`. Verify the actual proxy path before sharing the demo: one client's repeated invalid login attempts should reach 429, and another client should have an independent budget. If your custom proxy chain differs, configure the exact trusted hop count (0–2) and ensure the final proxy appends/overwrites forwarded addresses. Do not expose a shorter path that lets an attacker supply the trusted client address.

See [Render web services](https://render.com/docs/web-services) and [deployment stages](https://render.com/docs/deploys).

## 4. Apply migrations and seed upcoming shows

The Render start gate applies versioned migrations with checksums and a session lock. Migrations 001 and 002 are unchanged; both fresh schema creation and populated M1-to-M2 upgrades are regression-tested. Back up data before future schema changes. Do not edit applied SQL files.

To seed explicitly from a Render shell, run:

```sh
npm run seed:demo
```

If your plan has no shell, run the same command from `backend` on your computer using Node 24 and the **cloud direct URL** in process environment. Existing environment variables override local `.env` values. In PowerShell, enter the URL without showing it:

```powershell
$env:NODE_ENV = 'production'
$env:PAYMENT_MODE = 'demo'
$env:MIGRATION_DATABASE_URL = [System.Net.NetworkCredential]::new('', (Read-Host 'Neon DIRECT URL' -AsSecureString)).Password
$env:DATABASE_URL = $env:MIGRATION_DATABASE_URL
npm ci
npm run migrate
npm run seed:demo
Remove-Item Env:DATABASE_URL, Env:MIGRATION_DATABASE_URL, Env:PAYMENT_MODE, Env:NODE_ENV
```

Bash equivalent: `read -rsp 'Neon DIRECT URL: ' MIGRATION_DATABASE_URL`, export it and `DATABASE_URL`, `NODE_ENV=production`, `PAYMENT_MODE=demo`, run the commands above, then `unset` those variables. Confirm the selected cloud project/branch first; never run automated tests against this deployed database.

The seed creates six films, three theatres and seven days of upcoming screenings. Rerunning reuses demo catalog records, skips existing/overlapping shows and adds missing future slots. It does not reprice existing inventory, overwrite bookings, shift existing shows or delete history. An advisory lock serializes concurrent seed runs; the database exclusion constraint prevents overlapping shows. Existing auditorium layouts are preserved. Rerun weekly or before interviews; there is no background worker. Reserved demo names/poster paths identify seed records; don't rename them if you want catalog deduplication.

## 5. Provision a private administrator (optional)

No default public administrator exists. Do not publish admin credentials. Public signup cannot request ADMIN, and authorization reads roles from PostgreSQL.

The existing admin seed intentionally refuses `NODE_ENV=production`. To provision a trusted portfolio operator, run it **locally only**, with the intended cloud direct URL explicitly set as above, and temporarily set `NODE_ENV=development` in that one shell. Set `ADMIN_EMAIL`, `ADMIN_NAME` and securely enter `ADMIN_PASSWORD` as shown in README, then `npm run seed:admin`. It creates a new account and rejects existing email addresses rather than promoting a customer. Remove all credential environment variables afterwards. Keep Render itself in production mode. Do not offer a public “make admin” endpoint.

## 6. Create the Vercel frontend

Import the same GitHub repository:

| Setting | Value |
| --- | --- |
| Root directory | `frontend` |
| Framework preset | Vite |
| Node version | 24.x |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Public variable | `VITE_API_BASE=https://YOUR-BACKEND.onrender.com/api` |

Set the variable for Production and only those Preview environments intentionally using this backend. It must end in `/api`; no credentials, query string or localhost. Vercel builds reject missing/invalid hosted API configuration. Vite variables are embedded at build time: changing the value requires redeployment. **Never add database URLs, admin passwords or JWT secrets as `VITE_` variables.**

`frontend/vercel.json` supplies SPA fallback for React Router; refreshing `/movies`, `/bookings/123` or `/admin` serves the app. Vercel serves existing static files such as poster assets. API requests go directly to Render's HTTPS URL, not to Vercel functions or the Docker proxy. Local builds continue to default to `/api`.

Copy the resulting Vercel HTTPS origin into Render's `CORS_ORIGINS` and redeploy Render. Configure additional custom domains explicitly. See [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite) and [rewrite configuration](https://vercel.com/docs/routing/rewrites).

## 7. Live acceptance checklist (you run after deploying)

1. Open Render `/health`: expect 200 and database connected. Open `/api/config`: `payment_simulation` true only with `PAYMENT_MODE=demo`.
2. Confirm HTTPS certificates on both services. Verify browser requests use the HTTPS Render `/api` base, without CORS or mixed-content errors.
3. Register/login, browse movies and a future show, select seats, reserve, simulate payment, view confirmation/history, cancel, and check seats become available.
4. Try FAILED then SUCCESS before expiry. Refresh checkout after an ambiguous network failure: retry the same stored attempt key. No real payment fields should exist.
5. Use two browser profiles for the same seat. One hold succeeds; the other sees a conflict. Let a hold expire; it must not confirm.
6. Check another user's booking cannot be viewed/paid/cancelled. A customer cannot enter admin controls or call admin writes.
7. Privately log in as admin; create catalog records, seats and a screening. An overlapping screening must be rejected.
8. Refresh nested routes, logout, test token expiry, and check a narrow mobile viewport.
9. Verify rate-limit behavior through the real ingress. Auth allows 30 attempts/15 minutes/IP; all API mutations share 120/minute/IP. Respect 429 and Retry-After.

Cloud credentials were not available during local verification. These live provider, DNS, certificate, proxy-path and extension checks are required before sharing the deployed URL.

## 8. Redeploy and troubleshoot

After code changes, run the documented local tests/build, commit and push. Render/Vercel may auto-deploy the connected branch. Render's migration gate must succeed before serving the new version. Existing demo data persists in Neon; seeding is a separate explicit operation.

| Symptom | Check |
| --- | --- |
| Backend fails before listening | Render build/start logs, Node 24, required variables, migration error; never publish logs containing secrets |
| Database TLS failure | Direct URL, certificate trust and `sslmode=verify-full`; do not disable verification |
| Migration pooler error | Set `MIGRATION_DATABASE_URL` to Neon's direct hostname |
| `btree_gist` permission error | Correct Neon database owner/extension permission |
| Browser 403 `ORIGIN_DENIED` | Exact HTTPS origin in CORS, including custom-domain choice; redeploy backend |
| Payment 403 `SIMULATION_DISABLED` | Explicit `PAYMENT_MODE=demo` on backend; this never bypasses ownership |
| 409 booking conflict | Refresh availability/status; retry an ambiguous request with the same idempotency key |
| 429 | Wait for Retry-After; inspect proxy trust if all users share one budget |
| Empty future show list | Rerun explicit demo seed, or schedule shows as admin |
| Nested-page 404 | Vercel root must be `frontend`, with its `vercel.json` |
| Wrong API after env edit | Rebuild/redeploy frontend; Vite embeds public variables |
| Slow first request | Inspect provider sleep/cold-start limits; no timing claim was tested in cloud |

Rate limits are in-memory, reset on restart and do not coordinate across instances. Distributed attackers can bypass per-IP limits; keep this a small single-instance demo. JWTs in sessionStorage are accessible to JavaScript/XSS; no refresh token exists and logout discards the local token. Bearer tokens remain valid until expiry. Use unique demo passwords, avoid sensitive personal data, and do not treat this as production financial software.

`PAYMENT_MODE` accepts only `demo` or `disabled`. The selectable SUCCESS/FAILED outcome is a **demo exercise**, usable only through the authenticated, owner-checked transaction path when explicitly enabled. It is not gateway verification. A future real-payment mode requires verified server-side provider events and reconciliation, not another configurable success flag. All payment/refund records are fictional.

If a credential is ever exposed, rotate the Neon role password/JWT/admin credential first, update hosting secrets and redeploy. Removing the current file does not remove Git history; coordinate history cleanup with collaborators and invalidate affected sessions. The local audit found no known environment secrets or sensitive filenames in reachable Git history; this is not a guarantee against every possible secret format.

## 9. Stop or remove services

Disable automatic deployments, suspend/delete Render's web service, and remove/disable the Vercel project or domains as needed. Export any wanted demo data before deleting the Neon project/branch, which is destructive. Revoke integration access and rotate credentials when retiring the project. Check each provider's billing dashboard; stopping one service does not necessarily stop billing for the others.

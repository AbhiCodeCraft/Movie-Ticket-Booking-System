import { randomBytes } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
const rootEnv = new URL('../../.env',import.meta.url), backendEnv = new URL('../.env',import.meta.url);
if (existsSync(rootEnv) || existsSync(backendEnv)) throw new Error('Environment file already exists; edit it manually instead of overwriting credentials');
const password = randomBytes(24).toString('hex');
const secret = randomBytes(48).toString('hex');
writeFileSync(rootEnv,`POSTGRES_PASSWORD=${password}\nJWT_SECRET=${secret}\n`,{ flag:'wx' });
writeFileSync(backendEnv,`NODE_ENV=development\nPORT=3000\nDATABASE_URL=postgres://ticket:${password}@localhost:5433/ticket_booking\nJWT_SECRET=${secret}\nJWT_TTL_SECONDS=900\nCORS_ORIGINS=http://localhost:5173\n`,{ flag:'wx' });
console.log('Created ignored development environment files with random secrets');

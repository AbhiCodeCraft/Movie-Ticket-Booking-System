import { Pool } from 'pg';
import { readConfig } from './config/env.js';
import { createApp } from './app.js';
import { databaseOptions } from './db/connection.js';
const config = readConfig();
const pool = new Pool(databaseOptions(config.DATABASE_URL, config.DB_POOL_MAX));
pool.on('error', error => console.error('Idle database connection error:', error.message));
await pool.query('SELECT 1');
const server = createApp(pool,config).listen(config.PORT,'0.0.0.0');
server.once('listening', () => console.log(`Backend listening on port ${config.PORT}`));
server.on('error', async error => { console.error(error.message); await pool.end(); process.exitCode = 1; });
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const timer = setTimeout(() => process.exit(1), 10000).unref();
  server.close(async () => { await pool.end(); clearTimeout(timer); });
}
process.on('SIGINT',shutdown); process.on('SIGTERM',shutdown);

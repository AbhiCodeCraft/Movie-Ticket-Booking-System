import { Pool } from 'pg';
import { readConfig } from './config/env.js';
import { createApp } from './app.js';
const config = readConfig();
const pool = new Pool({ connectionString: config.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, options: '-c timezone=UTC -c statement_timeout=10000' });
pool.on('error', error => console.error('Idle database connection error:', error.message));
await pool.query('SELECT 1');
const server = createApp(pool,config).listen(config.PORT, () => console.log(`Backend listening on port ${config.PORT}`));
server.on('error', async error => { console.error(error.message); await pool.end(); process.exitCode = 1; });
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const timer = setTimeout(() => process.exit(1), 10000).unref();
  server.close(async () => { await pool.end(); clearTimeout(timer); });
}
process.on('SIGINT',shutdown); process.on('SIGTERM',shutdown);

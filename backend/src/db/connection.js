// Neon supports public CA verification. Never use rejectUnauthorized:false.
export function databaseOptions(connectionString, max = 5) {
  if (!connectionString) throw new Error('Database connection URL required');
  const url = new URL(connectionString);
  if (!['postgres:','postgresql:'].includes(url.protocol)) throw new Error('PostgreSQL URL required');
  if (url.hostname.endsWith('.neon.tech')) {
    for (const key of ['ssl','sslcert','sslkey','sslrootcert','uselibpqcompat']) {
      if (url.searchParams.has(key)) throw new Error('Use only sslmode=verify-full for Neon TLS configuration');
    }
    url.searchParams.set('sslmode','verify-full');
  }
  if (['no-verify','allow','prefer'].includes(url.searchParams.get('sslmode'))) throw new Error('Insecure database TLS mode');
  return { connectionString: url.href, max, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000 };
}

export function migrationURL(env = process.env) {
  const value = env.MIGRATION_DATABASE_URL || env.DATABASE_URL;
  if (new URL(value).hostname.includes('-pooler.')) throw new Error('Migrations require a direct database URL for session advisory locks');
  return value;
}

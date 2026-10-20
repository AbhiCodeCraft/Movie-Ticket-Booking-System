import { z } from 'zod';
export function readConfig(env = process.env) {
  const config = z.object({
    NODE_ENV: z.enum(['development','test','production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.url(), JWT_SECRET: z.string().min(32),
    JWT_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    HOLD_TTL_SECONDS: z.coerce.number().int().min(1).max(900).default(300),
    CORS_ORIGINS: z.string().default(''),
    PAYMENT_MODE: z.enum(['demo','disabled']).default('disabled'),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(2).default(0),
  }).parse(env);
  if (config.JWT_SECRET.includes('REPLACE_')) throw new Error('Replace example JWT_SECRET');
  config.origins = config.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
  for (const origin of config.origins) {
    const url = new URL(origin);
    if (!['http:','https:'].includes(url.protocol) || url.origin !== origin || (config.NODE_ENV === 'production' && url.protocol !== 'https:')) throw new Error('Invalid CORS origin');
  }
  return config;
}

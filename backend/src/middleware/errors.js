import { ZodError } from 'zod';
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof ZodError) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) } });
  if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') return res.status(400).json({ error: { code: 'INVALID_BODY', message: 'Invalid JSON body or body too large' } });
  const conflicts = ['23505','23503','23514','23P01','23502'];
  if (['40P01','40001','55P03','57014'].includes(error.code)) return res.status(409).json({ error: { code: 'RETRYABLE_CONFLICT', message: 'Database contention; retry with the same idempotency key' } });
  if (conflicts.includes(error.code)) return res.status(409).json({ error: { code: 'CONFLICT', message: 'Operation conflicts with existing data or a database constraint' } });
  if (error.status && error.status < 500) return res.status(error.status).json({ error: { code: error.code, message: error.message } });
  console.error(JSON.stringify({ level: 'error', message: error.message, code: error.code }));
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' } });
}

import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authController } from './controller.js';
import { authService } from './service.js';
export function authRoutes(db, config, auth) {
  const router = Router(), c = authController(authService(db, config));
  const limit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many authentication attempts' } } });
  router.post('/register', limit, c.register);
  router.post('/login', limit, c.login);
  router.get('/me', auth, c.me);
  router.post('/logout', auth, c.logout);
  return router;
}

import { Router } from 'express';
import { bookingsService } from './service.js';
import { bookingsController } from './controller.js';
export function bookingRoutes(pool,config,auth) {
  const router = Router(), c = bookingsController(bookingsService(pool,config));
  router.use(auth);
  router.post('/shows/:showId/locks',c.hold);
  router.post('/bookings',c.create);
  router.get('/bookings',c.history);
  router.get('/bookings/:bookingId/status',c.status);
  router.get('/bookings/:bookingId',c.get);
  return router;
}

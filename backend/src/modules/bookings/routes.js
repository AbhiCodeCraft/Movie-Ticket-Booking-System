import { Router } from 'express';
import { bookingsService } from './service.js';
import { bookingsController } from './controller.js';
export function bookingRoutes(pool,config,auth) {
  const router = Router(), c = bookingsController(bookingsService(pool,config));
  router.post('/shows/:showId/locks',auth,c.hold);
  router.post('/bookings',auth,c.create);
  router.get('/bookings',auth,c.history);
  router.get('/bookings/:bookingId/status',auth,c.status);
  router.get('/bookings/:bookingId',auth,c.get);
  return router;
}

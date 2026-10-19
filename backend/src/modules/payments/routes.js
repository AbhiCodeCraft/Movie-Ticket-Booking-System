import { Router } from 'express';
import { paymentsController } from './controller.js';
import { paymentsService } from './service.js';
export function paymentRoutes(pool,config,auth) {
  const router = Router(), c = paymentsController(paymentsService(pool,config));
  router.post('/bookings/:bookingId/payments',auth,c.pay);
  router.post('/bookings/:bookingId/cancel',auth,c.cancel);
  return router;
}

import { z } from 'zod';
import { id } from '../catalog/validation.js';
import { paymentInput,requestKey } from '../bookings/validation.js';
export const paymentsController = service => ({
  pay: async (req,res) => res.json({ data:await service.pay(req.user,id.parse(req.params.bookingId),paymentInput.parse(req.body),requestKey.parse(req.get('Idempotency-Key'))) }),
  cancel: async (req,res) => {
    z.object({}).strict().parse(req.body ?? {});
    res.json({ data:await service.cancel(req.user,id.parse(req.params.bookingId)) });
  },
});

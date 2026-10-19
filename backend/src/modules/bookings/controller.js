import { id } from '../catalog/validation.js';
import { holdInput,bookingInput,historyInput,requestKey } from './validation.js';
export const bookingsController = service => ({
  hold: async (req,res) => {
    const result = await service.hold(req.user,id.parse(req.params.showId),holdInput.parse(req.body),requestKey.parse(req.get('Idempotency-Key')));
    res.status(result.created ? 201 : 200).json({ data:result.data });
  },
  create: async (req,res) => res.json({ data:await service.create(req.user,bookingInput.parse(req.body).holdId) }),
  get: async (req,res) => res.json({ data:await service.get(req.user,id.parse(req.params.bookingId)) }),
  status: async (req,res) => {
    const b = await service.get(req.user,id.parse(req.params.bookingId));
    res.json({ data:{ booking_id:b.booking_id,status:b.status,payment_status:b.payment_status,expires_at:b.expires_at } });
  },
  history: async (req,res) => res.json(await service.history(req.user,historyInput.parse(req.query))),
});

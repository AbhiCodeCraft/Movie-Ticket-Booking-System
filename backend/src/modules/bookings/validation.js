import { z } from 'zod';
import { id } from '../catalog/validation.js';
export const requestKey = z.uuid();
export const holdInput = z.object({ seatIds: z.array(id).min(1).max(20).refine(ids => new Set(ids).size === ids.length, 'Duplicate show-seat IDs are not allowed') }).strict();
export const bookingInput = z.object({ holdId: z.uuid() }).strict();
export const paymentInput = z.object({ payment_method: z.enum(['CARD','UPI','NET_BANKING']), outcome: z.enum(['SUCCESS','FAILED']) }).strict();
export const historyInput = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).strict();

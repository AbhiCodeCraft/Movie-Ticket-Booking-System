import { z } from 'zod';
const email = z.string().trim().toLowerCase().pipe(z.email().max(255));
export const password = z.string().min(12).refine(v => Buffer.byteLength(v, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes');
export const registration = z.object({ name: z.string().trim().min(1).max(100), email, password, phone_no: z.string().regex(/^\+?[0-9]{7,14}$/).nullable().optional() }).strict();
export const loginInput = z.object({ email, password: z.string().min(1).refine(v => Buffer.byteLength(v, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes') }).strict();

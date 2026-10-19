import { z } from 'zod';
export const id = z.string().regex(/^[1-9]\d{0,18}$/).refine(v => /^[1-9]\d{0,18}$/.test(v) && BigInt(v) <= 9223372036854775807n, 'Invalid BIGINT ID');
export const text = max => z.string().trim().min(1).max(max);
export const date = z.iso.date();
export const timestamp = z.iso.datetime({ offset: true });
export const money = z.string().regex(/^(?:0|[1-9]\d{0,7})\.\d{2}$/).refine(v => v !== '0.00', 'Price must be positive');
export const listInput = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20), movie_id: id.optional(), theatre_id: id.optional(), auditorium_id: id.optional(), location: text(255).optional(), language: text(100).optional(), date: date.optional() }).strict();

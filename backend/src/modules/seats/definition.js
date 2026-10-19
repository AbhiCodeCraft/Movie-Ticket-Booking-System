import { z } from 'zod';
import { id, text } from '../catalog/validation.js';
export default { table: 'seats', key: 'seat_id', schema: z.object({ auditorium_id: id, seat_number: text(10), row: text(10), column: z.number().int().positive().max(2147483647), seat_type: text(20) }).strict() };

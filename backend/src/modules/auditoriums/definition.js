import { z } from 'zod';
import { id } from '../catalog/validation.js';
export default { table: 'auditoriums', key: 'auditorium_id', schema: z.object({ theatre_id: id, audi_number: z.number().int().positive() }).strict() };

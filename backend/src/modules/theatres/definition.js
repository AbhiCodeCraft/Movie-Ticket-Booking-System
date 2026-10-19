import { z } from 'zod';
import { text } from '../catalog/validation.js';
export default { table: 'theatres', key: 'theatre_id', schema: z.object({ theatre_name: text(255), location: text(255) }).strict() };

import { z } from 'zod';
import { id, timestamp, money } from '../catalog/validation.js';
export default { table: 'shows', key: 'show_id', schema: z.object({ movie_id: id, auditorium_id: id, start_time: timestamp, end_time: timestamp, price: money }).strict() };

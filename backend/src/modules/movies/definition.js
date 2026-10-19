import { z } from 'zod';
import { text, date } from '../catalog/validation.js';
export default { table: 'movies', key: 'movie_id', schema: z.object({ title: text(100), description: z.string().max(10000).nullable().optional(), language: text(100), release_date: date, poster_url: z.url().refine(v => ['https:','http:'].includes(new URL(v).protocol)).nullable().optional(), duration_minutes: z.number().int().positive().max(1440), genre: text(255).nullable().optional() }).strict() };

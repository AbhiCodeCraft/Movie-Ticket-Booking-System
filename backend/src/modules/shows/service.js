import definition from './definition.js';
import { catalogRepository } from '../catalog/repository.js';
import { showsRepository } from './repository.js';
import { transaction } from '../../db/transaction.js';
import { ApiError, required } from '../../utils/errors.js';
export function showsService(pool) {
  const repo = catalogRepository(pool, definition);
  return {
    get: async id => required(await repo.get(id)), list: filter => repo.list(filter),
    async availability(id) { required(await repo.get(id)); return showsRepository(pool).availability(id); },
    async mutate(action, id, input = {}) {
      return transaction(pool, async db => {
        const r = catalogRepository(db, definition), sr = showsRepository(db);
        const old = action === 'create' ? null : required(await r.get(id, true));
        if (old && (new Date(old.start_time) <= new Date() || await sr.hasBookings(id))) throw new ApiError(409,'CONFLICT','Shows with history or bookings cannot be changed or deleted');
        if (old && input.auditorium_id && input.auditorium_id !== old.auditorium_id) throw new ApiError(409,'CONFLICT','Show auditorium cannot be changed');
        if (action === 'remove') { await sr.clearSeats(id); return r.remove(id); }
        const { price, ...fields } = input;
        const merged = { ...old, ...fields };
        if (new Date(merged.start_time) <= new Date() || new Date(merged.start_time) >= new Date(merged.end_time)) throw new ApiError(400,'INVALID_TIME','Show must start in the future and end after it starts');
        required(await sr.lockAuditorium(merged.auditorium_id));
        if (action === 'create') {
          const show = await r.create(fields);
          if (!await sr.generateSeats(show,price)) throw new ApiError(409,'EMPTY_LAYOUT','Create auditorium seats before scheduling a show');
          return show;
        }
        const show = Object.keys(fields).length ? await r.update(id,fields) : old;
        if (price) await sr.price(id,price);
        return show;
      });
    },
  };
}

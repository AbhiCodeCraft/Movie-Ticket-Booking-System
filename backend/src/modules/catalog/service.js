import { catalogRepository } from './repository.js';
import { transaction } from '../../db/transaction.js';
import { required, ApiError } from '../../utils/errors.js';
export function catalogService(pool, def) {
  const repo = catalogRepository(pool, def);
  return {
    get: async id => required(await repo.get(id)),
    list: filter => repo.list(filter),
    async mutate(action, id, input) {
      return transaction(pool, async db => {
        const r = catalogRepository(db, def);
        const old = action === 'create' ? null : required(await r.get(id, true));
        if (def.table === 'seats') {
          const audi = old?.auditorium_id ?? input.auditorium_id;
          if (old && input?.auditorium_id && input.auditorium_id !== old.auditorium_id) throw new ApiError(409,'CONFLICT','Seat auditorium cannot be changed');
          required((await db.query('SELECT auditorium_id FROM auditoriums WHERE auditorium_id=$1 FOR UPDATE', [audi])).rows[0]);
          if ((await db.query('SELECT 1 FROM shows WHERE auditorium_id=$1 LIMIT 1', [audi])).rowCount) throw new ApiError(409,'CONFLICT','Seat layout is immutable after shows are scheduled');
        }
        if (def.table === 'auditoriums' && action === 'update' && input.theatre_id && input.theatre_id !== old.theatre_id) throw new ApiError(409,'CONFLICT','Auditorium theatre cannot be changed');
        if (action === 'create') return r.create(input);
        if (action === 'update') return r.update(id, input);
        return r.remove(id);
      });
    },
  };
}

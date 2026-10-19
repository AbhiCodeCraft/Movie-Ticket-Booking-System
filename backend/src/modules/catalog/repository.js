// Identifiers only come from server-owned module definitions and validated schema keys.
const quote = s => `"${s}"`;
export function catalogRepository(db, def) {
  const { table, key } = def;
  return {
    async get(id, lock = false) { return (await db.query(`SELECT * FROM ${table} WHERE ${key}=$1${lock ? ' FOR UPDATE' : ''}`, [id])).rows[0]; },
    async create(input) {
      const keys = Object.keys(input);
      return (await db.query(`INSERT INTO ${table}(${keys.map(quote)}) VALUES(${keys.map((_,i) => '$'+(i+1))}) RETURNING *`, Object.values(input))).rows[0];
    },
    async update(id, input) {
      const keys = Object.keys(input);
      return (await db.query(`UPDATE ${table} SET ${keys.map((k,i) => `${quote(k)}=$${i+2}`)} WHERE ${key}=$1 RETURNING *`, [id,...Object.values(input)])).rows[0];
    },
    async remove(id) { return (await db.query(`DELETE FROM ${table} WHERE ${key}=$1 RETURNING *`, [id])).rows[0]; },
    async list(filter) {
      const values = [], where = [];
      const add = (sql, value) => { values.push(value); where.push(sql.replace('?', '$'+values.length)); };
      let from = `${table} t`;
      if (table === 'shows') {
        from += ' JOIN auditoriums a ON a.auditorium_id=t.auditorium_id JOIN theatres th ON th.theatre_id=a.theatre_id';
        if (filter.movie_id) add('t.movie_id=?', filter.movie_id);
        if (filter.auditorium_id) add('t.auditorium_id=?', filter.auditorium_id);
        if (filter.theatre_id) add('a.theatre_id=?', filter.theatre_id);
        if (filter.location) add('lower(th.location)=lower(?)', filter.location);
        if (filter.date) { add('t.start_time >= ?::date::timestamp AT TIME ZONE \'UTC\'', filter.date); add('t.start_time < (?::date + 1)::timestamp AT TIME ZONE \'UTC\'', filter.date); }
      }
      if (table === 'movies' && filter.language) add('lower(t.language)=lower(?)', filter.language);
      if (table === 'theatres' && filter.location) add('lower(t.location)=lower(?)', filter.location);
      if (table === 'auditoriums' && filter.theatre_id) add('t.theatre_id=?', filter.theatre_id);
      if (table === 'seats' && filter.auditorium_id) add('t.auditorium_id=?', filter.auditorium_id);
      const clause = where.length ? ' WHERE '+where.join(' AND ') : '';
      // A single statement keeps count and page on the same PostgreSQL snapshot.
      const ids = [key,...Object.keys(def.schema.shape).filter(k => k.endsWith('_id'))];
      const jsonIds = ids.map(k => `'${k}',page.${k}::text`).join(',');
      const result = await db.query(`WITH filtered AS (SELECT t.* FROM ${from}${clause}), page AS (SELECT * FROM filtered ORDER BY ${key} LIMIT $${values.length+1} OFFSET $${values.length+2}) SELECT COALESCE((SELECT json_agg(to_jsonb(page) || jsonb_build_object(${jsonIds})) FROM page),'[]'::json) AS data, (SELECT count(*)::int FROM filtered) AS total`, [...values,filter.limit,(filter.page-1)*filter.limit]);
      return result.rows[0];
    },
  };
}

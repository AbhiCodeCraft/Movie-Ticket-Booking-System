import { Pool } from 'pg';
import { pathToFileURL } from 'node:url';
import { transaction } from '../transaction.js';
import { showsRepository } from '../../modules/shows/repository.js';
export async function seed(pool) {
  return transaction(pool, async db => {
    await db.query('SELECT pg_advisory_xact_lock(817244)');
    if ((await db.query("SELECT 1 FROM theatres WHERE theatre_name='M1 Demo Cinema' LIMIT 1")).rowCount) return;
    const theatre = (await db.query("INSERT INTO theatres(theatre_name,location) VALUES('M1 Demo Cinema','Mumbai') RETURNING theatre_id")).rows[0];
    const audi = (await db.query('INSERT INTO auditoriums(theatre_id,audi_number) VALUES($1,1) RETURNING auditorium_id',[theatre.theatre_id])).rows[0];
    for (const row of ['A','B','C']) for (let col=1; col<=6; col++) await db.query('INSERT INTO seats(auditorium_id,seat_number,row,"column",seat_type) VALUES($1,$2,$3,$4,$5)',[audi.auditorium_id,row+col,row,col,row === 'C' ? 'PREMIUM' : 'STANDARD']);
    for (let i=0;i<2;i++) {
      const movie = (await db.query("INSERT INTO movies(title,description,language,release_date,duration_minutes,genre) VALUES($1,'Sample portfolio catalog movie','Hindi',CURRENT_DATE,120,'Drama') RETURNING movie_id",[i === 0 ? 'The Last Train' : 'City of Dreams'])).rows[0];
      const show = (await db.query("INSERT INTO shows(movie_id,auditorium_id,start_time,end_time) VALUES($1,$2,(CURRENT_DATE+7)::timestamp AT TIME ZONE 'UTC'+$3::interval,(CURRENT_DATE+7)::timestamp AT TIME ZONE 'UTC'+$4::interval) RETURNING *",[movie.movie_id,audi.auditorium_id,`${12+i*3} hours`,`${14+i*3} hours`])).rows[0];
      await showsRepository(db).generateSeats(show,'250.00');
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.NODE_ENV !== 'development') throw new Error('Catalog seed is development-only');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try { await seed(pool); console.log('Catalog seed loaded'); } finally { await pool.end(); }
}

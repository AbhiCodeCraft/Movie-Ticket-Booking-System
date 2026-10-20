import {Pool} from 'pg';
import {databaseOptions, migrationURL} from '../connection.js';
import {pathToFileURL} from 'node:url';
import {transaction} from '../transaction.js';
import {showsRepository} from '../../modules/shows/repository.js';
export async function demoSeed(pool){return transaction(pool,async db=>{
  await db.query('SELECT pg_advisory_xact_lock(817245)');
  await db.query("SET LOCAL timezone='UTC'");
  const films=[['The Last Horizon','English','Adventure','An expedition across an untouched mountain range becomes a journey back to the things that matter.',142],['Midnight Express','Hindi','Thriller','On the last train out of the city, six strangers discover their destinations are connected.',128],['The Silent Tide','English','Mystery','A marine biologist returns to her coastal hometown, where the ocean is keeping one last secret.',116],['After the Rain','Hindi','Drama','Two old friends, a forgotten garden, and a monsoon that changes everything.',121],['Orbit Nine','English','Science fiction','Far from Earth, a lone astronaut receives a message that should be impossible.',136],['Golden Hour','Tamil','Romance','A photographer and a musician cross paths during one unforgettable evening in the city.',119]];
  const movies=[];
  for(let i=0;i<films.length;i++){
    const [title,language,genre,description,duration]=films[i];
    const existing=await db.query('SELECT movie_id FROM movies WHERE title=$1 AND poster_url=$2 ORDER BY movie_id LIMIT 1',[title,`/posters/${i}.svg`]);
    const movie=existing.rows[0] || (await db.query('INSERT INTO movies(title,language,genre,description,duration_minutes,release_date,poster_url) VALUES($1,$2,$3,$4,$5,CURRENT_DATE,$6) RETURNING movie_id',[title,language,genre,description,duration,`/posters/${i}.svg`])).rows[0];
    movies.push(movie.movie_id);
  }
  for(const [index,location] of ['Mumbai','Delhi','Bengaluru'].entries()){
    const theatreName=index===0?'Frame Grand \u2014 Demo':`Frame ${location} \u2014 Demo`;
    const theatre=(await db.query('SELECT theatre_id FROM theatres WHERE theatre_name=$1 AND location=$2 ORDER BY theatre_id LIMIT 1',[theatreName,location])).rows[0]
      || (await db.query('INSERT INTO theatres(theatre_name,location) VALUES($1,$2) RETURNING theatre_id',[theatreName,location])).rows[0];
    const existingAudi=(await db.query('SELECT auditorium_id FROM auditoriums WHERE theatre_id=$1 AND audi_number=1 FOR UPDATE',[theatre.theatre_id])).rows[0];
    const audi=existingAudi || (await db.query('INSERT INTO auditoriums(theatre_id,audi_number) VALUES($1,1) RETURNING auditorium_id',[theatre.theatre_id])).rows[0];
    // Never change an existing auditorium layout or historical inventory.
    if(!existingAudi) for(const row of ['A','B','C','D','E'])for(let col=1;col<=8;col++)await db.query('INSERT INTO seats(auditorium_id,seat_number,row,"column",seat_type) VALUES($1,$2,$3,$4,$5)',[audi.auditorium_id,row+col,row,col,row==='E'?'PREMIUM':'STANDARD']);
    for(let day=1;day<=7;day++)for(let slot=0;slot<3;slot++){
      const show=(await db.query("INSERT INTO shows(movie_id,auditorium_id,start_time,end_time) VALUES($1,$2,(CURRENT_DATE+$3::int)::timestamp AT TIME ZONE 'UTC'+$4::interval,(CURRENT_DATE+$3::int)::timestamp AT TIME ZONE 'UTC'+$5::interval) ON CONFLICT DO NOTHING RETURNING *",[movies[(day+slot+index)%movies.length],audi.auditorium_id,day,`${6+slot*3} hours`,`${8+slot*3} hours 30 minutes`])).rows[0];
      if(!show) continue; // Existing or overlapping screening: preserve it and its bookings.
      await showsRepository(db).generateSeats(show,'250.00');
      await db.query("UPDATE show_seats SET price=350 WHERE show_id=$1 AND seat_id IN (SELECT seat_id FROM seats WHERE auditorium_id=$2 AND seat_type='PREMIUM')",[show.show_id,audi.auditorium_id]);
    }
  }
});}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(process.env.PAYMENT_MODE!=='demo')throw new Error('Explicit PAYMENT_MODE=demo required for demo seed');const pool=new Pool(databaseOptions(migrationURL(),1));try{await demoSeed(pool);console.log('Upcoming demo catalog ready (existing data preserved)');}finally{await pool.end();}}

import {Pool} from 'pg';
import {pathToFileURL} from 'node:url';
import {transaction} from '../transaction.js';
import {showsRepository} from '../../modules/shows/repository.js';
export async function demoSeed(pool){return transaction(pool,async db=>{
  await db.query('SELECT pg_advisory_xact_lock(817245)');
  if((await db.query("SELECT 1 FROM theatres WHERE theatre_name='Frame Grand — Demo'")).rowCount)return;
  const films=[['The Last Horizon','English','Adventure','An expedition across an untouched mountain range becomes a journey back to the things that matter.',142],['Midnight Express','Hindi','Thriller','On the last train out of the city, six strangers discover their destinations are connected.',128],['The Silent Tide','English','Mystery','A marine biologist returns to her coastal hometown, where the ocean is keeping one last secret.',116],['After the Rain','Hindi','Drama','Two old friends, a forgotten garden, and a monsoon that changes everything.',121],['Orbit Nine','English','Science fiction','Far from Earth, a lone astronaut receives a message that should be impossible.',136],['Golden Hour','Tamil','Romance','A photographer and a musician cross paths during one unforgettable evening in the city.',119]];
  const movies=[];for(let i=0;i<films.length;i++){const [title,language,genre,description,duration]=films[i];movies.push((await db.query('INSERT INTO movies(title,language,genre,description,duration_minutes,release_date,poster_url) VALUES($1,$2,$3,$4,$5,CURRENT_DATE,$6) RETURNING movie_id',[title,language,genre,description,duration,`/posters/${i}.svg`])).rows[0].movie_id);}
  for(const [index,location] of ['Mumbai','Delhi','Bengaluru'].entries()){
    const theatre=(await db.query('INSERT INTO theatres(theatre_name,location) VALUES($1,$2) RETURNING theatre_id',[index===0?'Frame Grand — Demo':`Frame ${location} — Demo`,location])).rows[0];
    const audi=(await db.query('INSERT INTO auditoriums(theatre_id,audi_number) VALUES($1,1) RETURNING auditorium_id',[theatre.theatre_id])).rows[0];
    for(const row of ['A','B','C','D','E'])for(let col=1;col<=8;col++)await db.query('INSERT INTO seats(auditorium_id,seat_number,row,"column",seat_type) VALUES($1,$2,$3,$4,$5)',[audi.auditorium_id,row+col,row,col,row==='E'?'PREMIUM':'STANDARD']);
    for(let day=1;day<=7;day++)for(let slot=0;slot<3;slot++){
      const show=(await db.query("INSERT INTO shows(movie_id,auditorium_id,start_time,end_time) VALUES($1,$2,(CURRENT_DATE+$3::int)::timestamp AT TIME ZONE 'UTC'+$4::interval,(CURRENT_DATE+$3::int)::timestamp AT TIME ZONE 'UTC'+$5::interval) RETURNING *",[movies[(day+slot+index)%movies.length],audi.auditorium_id,day,`${6+slot*3} hours`,`${8+slot*3} hours 30 minutes`])).rows[0];
      await showsRepository(db).generateSeats(show,'250.00');
      await db.query("UPDATE show_seats SET price=350 WHERE show_id=$1 AND seat_id IN (SELECT seat_id FROM seats WHERE auditorium_id=$2 AND seat_type='PREMIUM')",[show.show_id,audi.auditorium_id]);
    }
  }
});}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(process.env.NODE_ENV!=='development')throw new Error('Demo seed is development-only');const pool=new Pool({connectionString:process.env.DATABASE_URL});try{await demoSeed(pool);console.log('Demo catalog ready (existing demo preserved)');}finally{await pool.end();}}

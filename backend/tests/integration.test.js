import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';
import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { migrate } from '../src/db/migrate.js';
import { seed } from '../src/db/seeds/catalog.js';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config/env.js';

// Always create a new database. Never migrate, truncate, or drop the configured database.
const databaseName = 'ticket_m1_test_'+randomBytes(12).toString('hex');
const adminUrl = new URL(process.env.TEST_ADMIN_URL ?? process.env.DATABASE_URL);
adminUrl.pathname = '/postgres';
const adminDb = new Pool({ connectionString: adminUrl.href });
let db, app, customerToken, adminToken, movie, audi, show, seat, created = false;
const password = 'A-strong-test-password-123';
const future = hours => new Date(Date.now()+hours*3600000).toISOString();
const movieBody = { title: 'Integration Movie', language: 'English', release_date: '2026-01-01', duration_minutes: 120 };
const auth = token => ({ Authorization: `Bearer ${token}` });
before(async () => {
  await adminDb.query(`CREATE DATABASE "${databaseName}"`); created = true;
  const url = new URL(adminUrl); url.pathname = '/'+databaseName;
  db = new Pool({ connectionString: url.href, max: 6, options: '-c timezone=UTC -c statement_timeout=10000' });
  await migrate(db); await migrate(db); await seed(db); await seed(db);
  const config = readConfig({ ...process.env, NODE_ENV: 'test' });
  app = createApp(db,config);
  const admin = await request(app).post('/api/auth/register').send({ name: 'Admin', email: 'admin@test.example', password });
  await db.query("UPDATE users SET role='ADMIN' WHERE user_id=$1",[admin.body.data.user_id]);
  adminToken = (await request(app).post('/api/auth/login').send({ email:'admin@test.example',password })).body.data.access_token;
  movie = (await db.query('SELECT * FROM movies ORDER BY movie_id LIMIT 1')).rows[0];
  audi = (await db.query('SELECT * FROM auditoriums LIMIT 1')).rows[0];
  show = (await db.query('SELECT * FROM shows ORDER BY show_id LIMIT 1')).rows[0];
  seat = (await db.query('SELECT * FROM seats LIMIT 1')).rows[0];
});
after(async () => {
  if (db) await db.end();
  if (created) {
    assert.match(databaseName,/^ticket_m1_test_[a-f0-9]{24}$/);
    await adminDb.query(`DROP DATABASE "${databaseName}"`);
  }
  await adminDb.end();
});
test('health checks actual PostgreSQL connectivity', async () => {
  const r = await request(app).get('/health').expect(200); assert.equal(r.body.data.database,'connected');
});
test('registration normalizes email, hashes password, and excludes hash', async () => {
  const r = await request(app).post('/api/auth/register').send({ name:' Customer ',email:' CUSTOMER@test.example ',password }).expect(201);
  assert.equal(r.body.data.email,'customer@test.example'); assert.equal(r.body.data.role,'USER'); assert.equal(r.body.data.password_hash,undefined);
  const user = (await db.query('SELECT * FROM users WHERE user_id=$1',[r.body.data.user_id])).rows[0];
  assert.notEqual(user.password_hash,password); assert.ok(await bcrypt.compare(password,user.password_hash));
});
test('duplicate email returns safe conflict', async () => {
  const r = await request(app).post('/api/auth/register').send({ name:'Other',email:'CUSTOMER@test.example',password }).expect(409);
  assert.equal(r.body.error.code,'CONFLICT'); assert.ok(!JSON.stringify(r.body).includes('users_email'));
});
test('public registration rejects ADMIN and supplied user IDs', async () => {
  await request(app).post('/api/auth/register').send({ name:'Bad',email:'bad@test.example',password,role:'ADMIN',user_id:'1' }).expect(400);
});
test('login issues validated JWT and profile omits password', async () => {
  const r = await request(app).post('/api/auth/login').send({ email:'customer@test.example',password }).expect(200);
  customerToken = r.body.data.access_token;
  const claims = jwt.verify(customerToken,process.env.JWT_SECRET,{ algorithms:['HS256'],issuer:'ticket-booking',audience:'ticket-booking-api' });
  assert.ok(claims.sub); assert.ok(claims.exp > claims.iat);
  const me = await request(app).get('/api/auth/me').set(auth(customerToken)).expect(200);
  assert.equal(me.body.data.password_hash,undefined); assert.equal(me.body.data.role,'USER');
});
test('wrong password and unknown email return identical errors', async () => {
  const a = await request(app).post('/api/auth/login').send({ email:'customer@test.example',password:'wrong' }).expect(401);
  const b = await request(app).post('/api/auth/login').send({ email:'missing@test.example',password:'wrong' }).expect(401);
  assert.deepEqual(a.body,b.body);
});
test('missing, forged, expired and wrong-audience tokens rejected', async () => {
  await request(app).get('/api/auth/me').expect(401);
  await request(app).get('/api/auth/me').set(auth('forged')).expect(401);
  for (const opts of [{ expiresIn:-1, audience:'ticket-booking-api' },{ expiresIn:60,audience:'wrong' }]) {
    const token = jwt.sign({},process.env.JWT_SECRET,{ subject:'1',issuer:'ticket-booking',...opts });
    await request(app).get('/api/auth/me').set(auth(token)).expect(401);
  }
});
test('USER cannot create and unauthenticated writes are rejected', async () => {
  await request(app).post('/api/movies').send(movieBody).expect(401);
  await request(app).post('/api/movies').set(auth(customerToken)).send(movieBody).expect(403);
});
test('catalog pagination returns stable string IDs and accurate empty-page count', async () => {
  const r = await request(app).get('/api/movies?page=1&limit=1').expect(200);
  assert.equal(r.body.data.length,1); assert.equal(r.body.pagination.total,2); assert.equal(typeof r.body.data[0].movie_id,'string');
  const empty = await request(app).get('/api/movies?page=99&limit=1').expect(200);
  assert.equal(empty.body.data.length,0); assert.equal(empty.body.pagination.total,2);
});
test('location, movie and UTC date filters and auditorium layout work', async () => {
  const day = new Date(show.start_time).toISOString().slice(0,10);
  const r = await request(app).get(`/api/shows?movie_id=${movie.movie_id}&location=Mumbai&date=${day}`).expect(200);
  assert.equal(r.body.data.length,1);
  await request(app).get('/api/theatres?location=Mumbai').expect(200);
  const layout = await request(app).get(`/api/auditoriums/${audi.auditorium_id}/seats`).expect(200);
  assert.equal(layout.body.data.length,18);
});
test('ADMIN can create, update and delete an unused movie', async () => {
  const r = await request(app).post('/api/movies').set(auth(adminToken)).send(movieBody).expect(201);
  const url = '/api/movies/'+r.body.data.movie_id;
  await request(app).patch(url).set(auth(adminToken)).send({ title:'Changed' }).expect(200);
  await request(app).delete(url).set(auth(adminToken)).expect(200);
  await request(app).get(url).expect(404);
});
test('ADMIN show creation generates one priced ShowSeat per physical seat', async () => {
  const r = await request(app).post('/api/shows').set(auth(adminToken)).send({ movie_id:movie.movie_id,auditorium_id:audi.auditorium_id,start_time:future(24),end_time:future(26),price:'199.50' }).expect(201);
  const url = '/api/shows/'+r.body.data.show_id;
  const availability = await request(app).get(url+'/seats').expect(200);
  assert.equal(availability.body.data.length,18);
  assert.ok(availability.body.data.every(s => s.price === '199.50' && s.status === 'AVAILABLE' && s.locked_by === undefined));
  await request(app).patch(url).set(auth(adminToken)).send({ price:'210.00' }).expect(200);
  const changed = await request(app).get(url+'/seats').expect(200); assert.equal(changed.body.data[0].price,'210.00');
  await request(app).delete(url).set(auth(adminToken)).expect(200);
});
test('overlap rejected by API and concurrent PostgreSQL writes', async () => {
  await request(app).post('/api/shows').set(auth(adminToken)).send({ movie_id:movie.movie_id,auditorium_id:audi.auditorium_id,start_time:show.start_time.toISOString(),end_time:show.end_time.toISOString(),price:'100.00' }).expect(409);
  const values = [movie.movie_id,audi.auditorium_id,future(48),future(50)];
  const sql = 'INSERT INTO shows(movie_id,auditorium_id,start_time,end_time) VALUES($1,$2,$3,$4)';
  const results = await Promise.allSettled([db.query(sql,values),db.query(sql,values)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length,1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code,'23P01');
});
test('adjacent shows are allowed by half-open scheduling constraint', async () => {
  await db.query('INSERT INTO shows(movie_id,auditorium_id,start_time,end_time) VALUES($1,$2,$3,$4)',[movie.movie_id,audi.auditorium_id,show.end_time,new Date(show.end_time.getTime()+3600000)]);
});
test('invalid movie foreign key rolls back show creation', async () => {
  const before = (await db.query('SELECT count(*) FROM shows')).rows[0].count;
  await request(app).post('/api/shows').set(auth(adminToken)).send({ movie_id:'999999',auditorium_id:audi.auditorium_id,start_time:future(72),end_time:future(74),price:'100.00' }).expect(409);
  assert.equal((await db.query('SELECT count(*) FROM shows')).rows[0].count,before);
});
test('cross-auditorium physical seat assignment rejected at database level', async () => {
  const other = (await db.query('INSERT INTO auditoriums(theatre_id,audi_number) VALUES($1,2) RETURNING *',[audi.theatre_id])).rows[0];
  const otherSeat = (await db.query('INSERT INTO seats(auditorium_id,seat_number,row,"column",seat_type) VALUES($1,\'A1\',\'A\',1,\'STANDARD\') RETURNING *',[other.auditorium_id])).rows[0];
  await assert.rejects(db.query('INSERT INTO show_seats(show_id,seat_id,auditorium_id,price) VALUES($1,$2,$3,100)',[show.show_id,otherSeat.seat_id,audi.auditorium_id]),{ code:'23503' });
});
test('database enforces money, duration, offer ranges and percentage limits', async () => {
  await assert.rejects(db.query('UPDATE movies SET duration_minutes=0 WHERE movie_id=$1',[movie.movie_id]),{ code:'23514' });
  await assert.rejects(db.query('UPDATE show_seats SET price=0 WHERE show_id=$1',[show.show_id]),{ code:'23514' });
  await assert.rejects(db.query("INSERT INTO offers(code,discount_type,discount_value,valid_from,valid_until) VALUES('BAD','PERCENTAGE',101,now(),now()+interval '1 day')"),{ code:'23514' });
  await assert.rejects(db.query("INSERT INTO offers(code,discount_type,discount_value,valid_from,valid_until) VALUES('BAD','FIXED',10,now(),now()-interval '1 day')"),{ code:'23514' });
});
test('dependent catalog records and scheduled seat layouts cannot be deleted or changed', async () => {
  await request(app).delete('/api/movies/'+movie.movie_id).set(auth(adminToken)).expect(409);
  await request(app).delete('/api/seats/'+seat.seat_id).set(auth(adminToken)).expect(409);
  await request(app).post('/api/seats').set(auth(adminToken)).send({ auditorium_id:audi.auditorium_id,seat_number:'Z1',row:'Z',column:1,seat_type:'STANDARD' }).expect(409);
});
test('booked show history survives deletes and cross-show booking seats are rejected', async () => {
  const user = (await db.query('SELECT user_id FROM users LIMIT 1')).rows[0];
  const booking = (await db.query('INSERT INTO bookings(show_id,user_id,total_amount) VALUES($1,$2,250) RETURNING *',[show.show_id,user.user_id])).rows[0];
  await request(app).delete('/api/shows/'+show.show_id).set(auth(adminToken)).expect(409);
  await request(app).patch('/api/shows/'+show.show_id).set(auth(adminToken)).send({ price:'1.00' }).expect(409);
  const wrongSeat = (await db.query('SELECT * FROM show_seats WHERE show_id<>$1 LIMIT 1',[show.show_id])).rows[0];
  await assert.rejects(db.query('INSERT INTO booking_seats VALUES($1,$2,$3)',[booking.booking_id,wrongSeat.show_seat_id,show.show_id]),{ code:'23503' });
});
test('invalid inputs, malformed JSON and unknown routes return structured errors', async () => {
  for (const url of ['/api/movies?page=0','/api/movies?limit=101','/api/movies/not-id','/api/shows?date=2026-02-30']) await request(app).get(url).expect(400);
  await request(app).get('/api/movies/99999999').expect(404);
  await request(app).get('/missing').expect(404);
  await request(app).post('/api/movies').set(auth(adminToken)).send({ ...movieBody,duration_minutes:-1 }).expect(400);
  await request(app).post('/api/auth/login').set('Content-Type','application/json').send('{').expect(400);
});
test('logout documents stateless client token disposal', async () => {
  const r = await request(app).post('/api/auth/logout').set(auth(customerToken)).expect(200);
  assert.match(r.body.data.message,/Discard/);
});
test('ADMIN theatre, auditorium and seat lifecycle works before scheduling', async () => {
  const th = (await request(app).post('/api/theatres').set(auth(adminToken)).send({ theatre_name:'New Cinema',location:'Delhi' }).expect(201)).body.data;
  const a = (await request(app).post('/api/auditoriums').set(auth(adminToken)).send({ theatre_id:th.theatre_id,audi_number:1 }).expect(201)).body.data;
  const body = { movie_id:movie.movie_id,auditorium_id:a.auditorium_id,start_time:future(100),end_time:future(102),price:'100.00' };
  await request(app).post('/api/shows').set(auth(adminToken)).send(body).expect(409);
  assert.equal((await db.query('SELECT 1 FROM shows WHERE auditorium_id=$1',[a.auditorium_id])).rowCount,0);
  const s = (await request(app).post('/api/seats').set(auth(adminToken)).send({ auditorium_id:a.auditorium_id,seat_number:'A1',row:'A',column:1,seat_type:'STANDARD' }).expect(201)).body.data;
  await request(app).patch('/api/seats/'+s.seat_id).set(auth(adminToken)).send({ seat_type:'PREMIUM' }).expect(200);
  await request(app).patch('/api/auditoriums/'+a.auditorium_id).set(auth(adminToken)).send({ audi_number:2 }).expect(200);
  await request(app).patch('/api/theatres/'+th.theatre_id).set(auth(adminToken)).send({ location:'Pune' }).expect(200);
  await request(app).delete('/api/seats/'+s.seat_id).set(auth(adminToken)).expect(200);
  await request(app).delete('/api/auditoriums/'+a.auditorium_id).set(auth(adminToken)).expect(200);
  await request(app).delete('/api/theatres/'+th.theatre_id).set(auth(adminToken)).expect(200);
});
test('invalid price, inverted times and past shows rejected', async () => {
  const body = { movie_id:movie.movie_id,auditorium_id:audi.auditorium_id,start_time:future(100),end_time:future(102),price:'100.00' };
  for (const change of [{ price:100 },{ price:'0.00' },{ end_time:future(99) },{ start_time:future(-3),end_time:future(-1) }]) await request(app).post('/api/shows').set(auth(adminToken)).send({ ...body,...change }).expect(400);
  const past = (await db.query('INSERT INTO shows(movie_id,auditorium_id,start_time,end_time) VALUES($1,$2,$3,$4) RETURNING show_id',[movie.movie_id,audi.auditorium_id,future(-10),future(-8)])).rows[0];
  await request(app).delete('/api/shows/'+past.show_id).set(auth(adminToken)).expect(409);
});
test('BIGINT overflow, bcrypt byte limits and calendar dates handled safely', async () => {
  await request(app).get('/api/movies/9223372036854775808').expect(400);
  await request(app).post('/api/auth/register').send({ name:'Long',email:'long@test.example',password:'😀'.repeat(20) }).expect(400);
  const r = await request(app).get('/api/movies/'+movie.movie_id).expect(200);
  assert.match(r.body.data.release_date,/^\d{4}-\d{2}-\d{2}$/);
});
test('roles are read from database rather than stale JWT claims', async () => {
  const uid = jwt.decode(adminToken).sub;
  await db.query("UPDATE users SET role='USER' WHERE user_id=$1",[uid]);
  await request(app).post('/api/movies').set(auth(adminToken)).send(movieBody).expect(403);
  await db.query("UPDATE users SET role='ADMIN' WHERE user_id=$1",[uid]);
});
test('development admin seed rejects production and existing users', async () => {
  const url = new URL(adminUrl); url.pathname = '/'+databaseName;
  const env = { ...process.env,DATABASE_URL:url.href,ADMIN_EMAIL:'seed-admin@test.example',ADMIN_PASSWORD:password,ADMIN_NAME:'Seed Admin' };
  const run = mode => spawnSync(process.execPath,['src/db/seeds/admin.js'],{ env:{ ...env,NODE_ENV:mode },encoding:'utf8' });
  assert.notEqual(run('production').status,0);
  assert.equal(run('development').status,0);
  assert.notEqual(run('development').status,0);
  assert.equal((await db.query('SELECT role FROM users WHERE email=$1',[env.ADMIN_EMAIL])).rows[0].role,'ADMIN');
});
test('migration checksums reject modified applied migrations', async () => {
  const original = (await db.query('SELECT * FROM schema_migrations LIMIT 1')).rows[0];
  await db.query("UPDATE schema_migrations SET checksum='modified' WHERE name=$1",[original.name]);
  await assert.rejects(migrate(db),/Applied migration changed/);
  await db.query('UPDATE schema_migrations SET checksum=$2 WHERE name=$1',[original.name,original.checksum]);
});
test('concurrent API seat addition and show creation produce complete inventory', async () => {
  const a = (await request(app).post('/api/auditoriums').set(auth(adminToken)).send({ theatre_id:audi.theatre_id,audi_number:99 }).expect(201)).body.data;
  const seatBody = { auditorium_id:a.auditorium_id,seat_number:'A1',row:'A',column:1,seat_type:'STANDARD' };
  await request(app).post('/api/seats').set(auth(adminToken)).send(seatBody).expect(201);
  const [s,sh] = await Promise.all([
    request(app).post('/api/seats').set(auth(adminToken)).send({ ...seatBody,seat_number:'A2',column:2 }),
    request(app).post('/api/shows').set(auth(adminToken)).send({ movie_id:movie.movie_id,auditorium_id:a.auditorium_id,start_time:future(120),end_time:future(122),price:'100.00' }),
  ]);
  assert.equal(sh.status,201); assert.ok([201,409].includes(s.status));
  const counts = (await db.query('SELECT (SELECT count(*) FROM seats WHERE auditorium_id=$1) AS physical,(SELECT count(*) FROM show_seats WHERE show_id=$2) AS inventory',[a.auditorium_id,sh.body.data.show_id])).rows[0];
  assert.equal(counts.physical,counts.inventory);
});
test('seat edits and scheduling use a consistent lock order', async () => {
  const a = (await request(app).post('/api/auditoriums').set(auth(adminToken)).send({ theatre_id:audi.theatre_id,audi_number:100 }).expect(201)).body.data;
  const s = (await request(app).post('/api/seats').set(auth(adminToken)).send({ auditorium_id:a.auditorium_id,seat_number:'A1',row:'A',column:1,seat_type:'STANDARD' }).expect(201)).body.data;
  const [edit,scheduled] = await Promise.all([
    request(app).patch('/api/seats/'+s.seat_id).set(auth(adminToken)).send({ seat_type:'PREMIUM' }),
    request(app).post('/api/shows').set(auth(adminToken)).send({ movie_id:movie.movie_id,auditorium_id:a.auditorium_id,start_time:future(120),end_time:future(122),price:'100.00' }),
  ]);
  assert.equal(scheduled.status,201); assert.ok([200,409].includes(edit.status));
});
test('oversized PostgreSQL integers and bcrypt login inputs return validation errors', async () => {
  await request(app).post('/api/auditoriums').set(auth(adminToken)).send({ theatre_id:audi.theatre_id,audi_number:2147483648 }).expect(400);
  await request(app).post('/api/auth/login').send({ email:'customer@test.example',password:'x'.repeat(73) }).expect(400);
});
test('public frontend configuration exposes only simulation availability and server time',async()=>{
  const r=await request(app).get('/api/config').expect(200);
  assert.deepEqual(Object.keys(r.body.data).sort(),['payment_simulation','server_time']);
  assert.equal(r.body.data.payment_simulation,true);assert.ok(Number.isFinite(Date.parse(r.body.data.server_time)));
  const production=createApp(db,readConfig({...process.env,NODE_ENV:'production',CORS_ORIGINS:''}));
  assert.equal((await request(production).get('/api/config').expect(200)).body.data.payment_simulation,false);
});

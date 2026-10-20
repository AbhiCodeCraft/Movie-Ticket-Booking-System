import { test,before,beforeEach,after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID,createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { migrate } from '../src/db/migrate.js';
import { seed } from '../src/db/seeds/catalog.js';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config/env.js';

const name = 'ticket_m2_test_'+randomBytes(12).toString('hex');
const url = new URL(process.env.TEST_ADMIN_URL ?? process.env.DATABASE_URL); url.pathname='/postgres';
const maintenance = new Pool({ connectionString:url.href });
let db,app,config,created=false,movieId,theatreId,legacyBooking,legacySeat;
const users=[];
let audiNumber=1000;
const headers = user => ({ Authorization:'Bearer '+user.token });
const hold = (user,f,ids=[f.ids[0]],key=randomUUID()) => request(app).post(`/api/shows/${f.showId}/locks`).set(headers(user)).set('Idempotency-Key',key).send({ seatIds:ids });
const pay = (user,b,outcome='SUCCESS',key=randomUUID()) => request(app).post(`/api/bookings/${b.booking_id}/payments`).set(headers(user)).set('Idempotency-Key',key).send({ payment_method:'UPI',outcome });
const cancel = (user,b) => request(app).post(`/api/bookings/${b.booking_id}/cancel`).set(headers(user)).send({});
async function fixture() {
  const a = (await db.query('INSERT INTO auditoriums(theatre_id,audi_number) VALUES($1,$2) RETURNING auditorium_id',[theatreId,audiNumber++])).rows[0];
  for (let i=1;i<=3;i++) await db.query('INSERT INTO seats(auditorium_id,seat_number,row,"column",seat_type) VALUES($1,$2,\'A\',$3,\'STANDARD\')',[a.auditorium_id,'A'+i,i]);
  const show = (await db.query("INSERT INTO shows(movie_id,auditorium_id,start_time,end_time) VALUES($1,$2,clock_timestamp()+interval '1 day',clock_timestamp()+interval '1 day 2 hours') RETURNING show_id",[movieId,a.auditorium_id])).rows[0];
  const seats = (await db.query('INSERT INTO show_seats(show_id,seat_id,auditorium_id,price) SELECT $1,seat_id,auditorium_id,"column"*10.10 FROM seats WHERE auditorium_id=$2 RETURNING show_seat_id',[show.show_id,a.auditorium_id])).rows;
  return { showId:show.show_id,ids:seats.map(s => s.show_seat_id) };
}
async function inventory(f) { return (await db.query('SELECT * FROM show_seats WHERE show_id=$1 ORDER BY show_seat_id',[f.showId])).rows; }
async function expire(b,client=db) {
  await client.query("UPDATE bookings SET expires_at=clock_timestamp()-interval '1 second' WHERE booking_id=$1",[b.booking_id]);
  await client.query("UPDATE show_seats SET locked_until=clock_timestamp()-interval '1 second' WHERE current_booking_id=$1",[b.booking_id]);
}
async function waitForLockWaiters(count) {
  const deadline=Date.now()+4000;
  while (Date.now()<deadline) {
    const r=await db.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT * FROM shows WHERE show_id=%'");
    if (r.rows[0].n>=count) return;
    await new Promise(resolve => setTimeout(resolve,10));
  }
  assert.fail('Expected concurrent requests to wait on the show row lock');
}
before(async () => {
  await maintenance.query(`CREATE DATABASE "${name}"`); created=true;
  const target=new URL(url); target.pathname='/'+name;
  db=new Pool({ connectionString:target.href,max:25,options:'-c timezone=UTC -c statement_timeout=10000' });
  // Exercise a populated M1 -> M2 upgrade, not just fresh schema creation.
  const sql=await readFile(new URL('../src/db/migrations/001_foundation.sql',import.meta.url),'utf8');
  await db.query(sql);
  await db.query('CREATE TABLE schema_migrations(name TEXT PRIMARY KEY,checksum TEXT NOT NULL,applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  await db.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',['001_foundation.sql',createHash('sha256').update(sql).digest('hex')]);
  await seed(db);
  const u=(await db.query("INSERT INTO users(name,email,password_hash) VALUES('Legacy','legacy@test.example','fixture-no-login') RETURNING user_id")).rows[0];
  legacySeat=(await db.query('SELECT * FROM show_seats ORDER BY show_seat_id LIMIT 1')).rows[0];
  legacyBooking=(await db.query("INSERT INTO bookings(show_id,user_id,total_amount,status) VALUES($1,$2,250,'CONFIRMED') RETURNING *",[legacySeat.show_id,u.user_id])).rows[0];
  await db.query('INSERT INTO booking_seats VALUES($1,$2,$3)',[legacyBooking.booking_id,legacySeat.show_seat_id,legacySeat.show_id]);
  await db.query("UPDATE show_seats SET status='BOOKED' WHERE show_seat_id=$1",[legacySeat.show_seat_id]);
  await db.query("INSERT INTO payments(booking_id,amount,payment_method,status) VALUES($1,250,'UPI','SUCCESS')",[legacyBooking.booking_id]);
  await migrate(db); await migrate(db);
  config=readConfig({ ...process.env,NODE_ENV:'test',PAYMENT_MODE:'demo',HOLD_TTL_SECONDS:'300' }); app=createApp(db,config);
  movieId=(await db.query('SELECT movie_id FROM movies LIMIT 1')).rows[0].movie_id;
  theatreId=(await db.query('SELECT theatre_id FROM theatres LIMIT 1')).rows[0].theatre_id;
  for (let i=0;i<21;i++) {
    const user=(await db.query('INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING user_id,role',[`User ${i}`,`user${i}@m2.example`,'fixture-no-login',i===20 ? 'ADMIN' : 'USER'])).rows[0];
    user.token=jwt.sign({},config.JWT_SECRET,{ subject:user.user_id,issuer:'ticket-booking',audience:'ticket-booking-api',expiresIn:3600,algorithm:'HS256' });
    users.push(user);
  }
});
// Independent scenarios get independent process-local rate-limit counters.
beforeEach(() => { app=createApp(db,config); });
after(async () => {
  if(db) await db.end();
  if(created) { assert.match(name,/^ticket_m2_test_[a-f0-9]{24}$/); await maintenance.query(`DROP DATABASE "${name}"`); }
  await maintenance.end();
});

test('M1 upgrade preserves confirmed history and backfills active ownership and price',async () => {
  const b=(await db.query('SELECT * FROM bookings WHERE booking_id=$1',[legacyBooking.booking_id])).rows[0];
  assert.equal(b.status,'CONFIRMED'); assert.equal(b.hold_id,null);
  const s=(await db.query('SELECT * FROM booking_seats WHERE booking_id=$1',[b.booking_id])).rows[0];
  assert.equal(s.active,true); assert.equal(s.price,'250.00');
  assert.equal((await db.query('SELECT current_booking_id FROM show_seats WHERE show_seat_id=$1',[legacySeat.show_seat_id])).rows[0].current_booking_id,b.booking_id);
});
test('single seat hold creates a pending booking and five-minute database deadline',async () => {
  const f=await fixture(),r=await hold(users[0],f).expect(201),b=r.body.data;
  assert.equal(b.status,'PENDING'); assert.equal(b.total_amount,'10.10'); assert.ok(b.hold_id);
  const s=(await inventory(f))[0]; assert.equal(s.current_booking_id,b.booking_id); assert.equal(s.locked_by,users[0].user_id); assert.equal(s.status,'LOCKED');
  const seconds=(await db.query('SELECT extract(epoch FROM expires_at-created_at) AS seconds FROM bookings WHERE booking_id=$1',[b.booking_id])).rows[0].seconds;
  assert.ok(Number(seconds)>=299 && Number(seconds)<302);
});
test('multi-seat hold snapshots precise prices and creates one association per seat',async () => {
  const f=await fixture(),b=(await hold(users[0],f,f.ids).expect(201)).body.data;
  assert.equal(b.total_amount,'60.60'); assert.deepEqual(b.seats.map(s=>s.price),['10.10','20.20','30.30']);
  assert.ok((await inventory(f)).every(s=>s.current_booking_id===b.booking_id));
});
test('mixed unavailable selection rolls back without partial holds or orphan bookings',async () => {
  const f=await fixture(); await hold(users[0],f,[f.ids[1]]).expect(201);
  await hold(users[1],f,[f.ids[0],f.ids[1]]).expect(409);
  assert.equal((await inventory(f))[0].status,'AVAILABLE');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM bookings WHERE show_id=$1',[f.showId])).rows[0].n,1);
});
test('duplicate, empty, oversized, numeric and invalid seat IDs rejected',async () => {
  const f=await fixture();
  for(const ids of [[f.ids[0],f.ids[0]],[],Array.from({length:21},(_,i)=>String(i+1)),[Number(f.ids[0])],['bad']]) await hold(users[0],f,ids).expect(400);
});
test('nonexistent seats, wrong-show seats and missing shows rejected without mutation',async () => {
  const f=await fixture(),other=await fixture();
  await hold(users[0],f,['9223372036854775807']).expect(404);
  await hold(users[0],f,[other.ids[0]]).expect(400);
  await hold(users[0],{showId:'9223372036854775807',ids:f.ids}).expect(404);
  assert.ok((await inventory(f)).every(s=>s.status==='AVAILABLE'));
});
test('hold key replays same selection without renewal and rejects changed selection',async () => {
  const f=await fixture(),key=randomUUID(),b=(await hold(users[0],f,[f.ids[1],f.ids[0]],key).expect(201)).body.data;
  const replay=(await hold(users[0],f,[f.ids[0],f.ids[1]],key).expect(200)).body.data;
  assert.equal(replay.booking_id,b.booking_id); assert.equal(replay.expires_at,b.expires_at);
  await hold(users[0],f,[f.ids[2]],key).expect(409);
});
test('same owner cannot extend a hold using a different reservation key',async () => {
  const f=await fixture(); await hold(users[0],f).expect(201); await hold(users[0],f).expect(409); await hold(users[1],f).expect(409);
});
test('POST bookings is an idempotent owner-only acknowledgement of the held booking',async () => {
  const f=await fixture(),b=(await hold(users[0],f).expect(201)).body.data;
  for(let i=0;i<2;i++) {
    const r=await request(app).post('/api/bookings').set(headers(users[0])).send({holdId:b.hold_id}).expect(200);
    assert.equal(r.body.data.booking_id,b.booking_id);
  }
  await request(app).post('/api/bookings').set(headers(users[1])).send({holdId:b.hold_id}).expect(403);
});
test('success atomically confirms booking, active ownership and booked inventory',async () => {
  const f=await fixture(),b=(await hold(users[0],f,f.ids).expect(201)).body.data;
  const r=await pay(users[0],b).expect(200);
  assert.equal(r.body.data.payment.amount,'60.60'); assert.equal(r.body.data.payment.status,'SUCCESS'); assert.equal(r.body.data.booking.status,'CONFIRMED');
  assert.ok((await inventory(f)).every(s=>s.status==='BOOKED' && s.locked_by===null && s.locked_until===null));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM booking_seats WHERE booking_id=$1 AND active',[b.booking_id])).rows[0].n,3);
  await hold(users[1],f).expect(409);
});
test('failed attempts remain replayable after a later successful payment',async () => {
  const f=await fixture(),b=(await hold(users[0],f).expect(201)).body.data,key=randomUUID();
  const fail=await pay(users[0],b,'FAILED',key).expect(200);
  assert.equal(fail.body.data.booking.status,'PENDING'); assert.equal((await inventory(f))[0].status,'LOCKED');
  const fail2=await pay(users[0],b,'FAILED',key).expect(200); assert.equal(fail2.body.data.payment.payment_id,fail.body.data.payment.payment_id);
  await pay(users[0],b,'SUCCESS',key).expect(409);
  await pay(users[0],b).expect(200);
  const replay=await pay(users[0],b,'FAILED',key).expect(200); assert.equal(replay.body.data.payment.status,'FAILED'); assert.equal(replay.body.data.booking.status,'CONFIRMED');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM payments WHERE booking_id=$1',[b.booking_id])).rows[0].n,2);
});
test('payment rejects non-owner and client-supplied prices or payment credentials',async () => {
  const f=await fixture(),b=(await hold(users[0],f).expect(201)).body.data;
  await pay(users[1],b).expect(403);
  await request(app).post(`/api/bookings/${b.booking_id}/payments`).set(headers(users[0])).set('Idempotency-Key',randomUUID()).send({outcome:'SUCCESS',payment_method:'CARD',amount:'0.01',card_number:'never-store'}).expect(400);
});
test('booking details/history include seats, exact price, location and payment status; privacy enforced',async () => {
  const f=await fixture(),b=(await hold(users[2],f,f.ids).expect(201)).body.data;
  const history=await request(app).get('/api/bookings?page=1&limit=1').set(headers(users[2])).expect(200);
  assert.equal(history.body.data[0].booking_id,b.booking_id); assert.equal(history.body.data[0].seats.length,3); assert.equal(history.body.data[0].total_amount,'60.60'); assert.ok(history.body.data[0].movie_title); assert.equal(history.body.data[0].location,'Mumbai');
  await request(app).get(`/api/bookings/${b.booking_id}`).set(headers(users[1])).expect(403);
  await request(app).get(`/api/bookings/${b.booking_id}/status`).set(headers(users[1])).expect(403);
  const status=await request(app).get(`/api/bookings/${b.booking_id}/status`).set(headers(users[2])).expect(200); assert.equal(status.body.data.payment_status,'UNPAID');
});
test('cancellation refunds successful simulation, preserves history and allows rebooking',async () => {
  const f=await fixture(),b=(await hold(users[0],f).expect(201)).body.data,key=randomUUID();
  await pay(users[0],b,'SUCCESS',key).expect(200);
  const c=await cancel(users[0],b).expect(200); assert.equal(c.body.data.status,'CANCELLED'); assert.equal(c.body.data.payment_status,'REFUNDED'); assert.equal(c.body.data.seats.length,1);
  await cancel(users[0],b).expect(200);
  const newer=(await hold(users[1],f).expect(201)).body.data; await pay(users[1],newer).expect(200);
  const replay=await pay(users[0],b,'SUCCESS',key).expect(200); assert.equal(replay.body.data.payment.status,'REFUNDED');
  await cancel(users[0],b).expect(200); assert.equal((await inventory(f))[0].current_booking_id,newer.booking_id);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM booking_seats WHERE show_seat_id=$1',[f.ids[0]])).rows[0].n,2);
});
test('pending cancellation releases seats, rejects non-owner and permits administrator',async () => {
  const f=await fixture(),b=(await hold(users[0],f).expect(201)).body.data;
  await cancel(users[1],b).expect(403); await cancel(users[20],b).expect(200);
  assert.equal((await inventory(f))[0].status,'AVAILABLE'); await pay(users[0],b).expect(409);
});
test('cancellation after show start is rejected and confirmed seats remain booked',async () => {
  const f=await fixture(),b=(await hold(users[0],f).expect(201)).body.data; await pay(users[0],b).expect(200);
  await db.query("UPDATE shows SET start_time=clock_timestamp()-interval '1 minute' WHERE show_id=$1",[f.showId]);
  await cancel(users[0],b).expect(409); assert.equal((await inventory(f))[0].status,'BOOKED');
});
test('availability and history report expiry without a worker, then new owner acquires',async () => {
  const f=await fixture(),b=(await hold(users[3],f).expect(201)).body.data; await expire(b);
  const r=await request(app).get(`/api/shows/${f.showId}/seats`).expect(200); assert.equal(r.body.data[0].status,'AVAILABLE');
  const h=await request(app).get('/api/bookings').set(headers(users[3])).expect(200); assert.equal(h.body.data[0].status,'EXPIRED');
  assert.equal((await inventory(f))[0].status,'LOCKED'); // Read projection, no worker mutation.
  await pay(users[3],b).expect(409); await hold(users[4],f).expect(201);
  assert.equal((await db.query('SELECT status FROM bookings WHERE booking_id=$1',[b.booking_id])).rows[0].status,'EXPIRED');
});
test('same-user ABA reacquisition cannot be confirmed or released by old hold',async () => {
  const f=await fixture(),old=(await hold(users[0],f).expect(201)).body.data; await expire(old);
  const newer=(await hold(users[0],f).expect(201)).body.data;
  assert.notEqual(newer.hold_id,old.hold_id);
  await pay(users[0],old).expect(409); await cancel(users[0],old).expect(409);
  await request(app).post('/api/bookings').set(headers(users[0])).send({holdId:old.hold_id}).expect(409);
  assert.equal((await inventory(f))[0].current_booking_id,newer.booking_id); await pay(users[0],newer).expect(200);
});
test('production disables simulation even for a valid owner',async () => {
  const f=await fixture(),b=(await hold(users[0],f).expect(201)).body.data;
  const production=createApp(db,{...config,NODE_ENV:'production',PAYMENT_MODE:undefined});
  await request(production).post(`/api/bookings/${b.booking_id}/payments`).set(headers(users[0])).set('Idempotency-Key',randomUUID()).send({payment_method:'UPI',outcome:'SUCCESS'}).expect(403);
});
test('unauthenticated booking APIs and malformed keys/hold identities are rejected',async () => {
  const f=await fixture();
  for(const path of ['/api/bookings','/api/bookings/1','/api/bookings/1/status']) await request(app).get(path).expect(401);
  for(const path of [`/api/shows/${f.showId}/locks`,'/api/bookings','/api/bookings/1/payments','/api/bookings/1/cancel']) await request(app).post(path).send({}).expect(401);
  await hold(users[0],f,f.ids,'bad-key').expect(400);
  await request(app).post('/api/bookings').set(headers(users[0])).send({holdId:'bad'}).expect(400);
  await request(app).get('/api/bookings?limit=101').set(headers(users[0])).expect(400);
});

test('A: two simultaneous users competing for one seat yield exactly one holder',async () => {
  const f=await fixture(); const results=await Promise.all([hold(users[0],f),hold(users[1],f)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  const winner=results.find(r=>r.status===201).body.data;
  assert.equal((await inventory(f))[0].current_booking_id,winner.booking_id);
});
test('B: 20 simultaneous users yield one durable holder and no extra bookings',async () => {
  const f=await fixture(),results=await Promise.all(users.slice(0,20).map(u=>hold(u,f)));
  assert.equal(results.filter(r=>r.status===201).length,1); assert.equal(results.filter(r=>r.status===409).length,19);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM bookings WHERE show_id=$1',[f.showId])).rows[0].n,1);
  assert.equal((await inventory(f)).filter(s=>s.status==='LOCKED').length,1);
});
test('C: overlapping multi-seat requests never create partial ownership',async () => {
  const f=await fixture(),results=await Promise.all([hold(users[0],f,[f.ids[0],f.ids[1]]),hold(users[1],f,[f.ids[2],f.ids[1]])]);
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  const seats=await inventory(f); assert.equal(seats.filter(s=>s.status==='LOCKED').length,2); assert.equal(seats.filter(s=>s.status==='AVAILABLE').length,1);
  assert.equal(new Set(seats.filter(s=>s.status==='LOCKED').map(s=>s.current_booking_id)).size,1);
});
test('D: 12 concurrent payment retries produce one successful financial record',async () => {
  const f=await fixture(),b=(await hold(users[0],f).expect(201)).body.data,key=randomUUID();
  const results=await Promise.all(Array.from({length:12},()=>pay(users[0],b,'SUCCESS',key)));
  assert.ok(results.every(r=>r.status===200)); assert.equal(new Set(results.map(r=>r.body.data.payment.payment_id)).size,1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM payments WHERE booking_id=$1',[b.booking_id])).rows[0].n,1);
  assert.equal((await inventory(f))[0].status,'BOOKED');
});
test('D2: concurrent distinct payment keys cannot create duplicate charges',async () => {
  const f=await fixture(),b=(await hold(users[0],f).expect(201)).body.data;
  const results=await Promise.all(Array.from({length:8},()=>pay(users[0],b)));
  assert.equal(results.filter(r=>r.status===200).length,1); assert.equal(results.filter(r=>r.status===409).length,7);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM payments WHERE booking_id=$1',[b.booking_id])).rows[0].n,1);
});
test('E: expiry while requests wait cannot confirm or overwrite a replacement hold',async () => {
  const f=await fixture(),b=(await hold(users[0],f).expect(201)).body.data,blocker=await db.connect();
  let paying,acquiring;
  try {
    await blocker.query('BEGIN'); await blocker.query('SELECT * FROM shows WHERE show_id=$1 FOR UPDATE',[f.showId]);
    paying=pay(users[0],b).then(r=>r); acquiring=hold(users[1],f).then(r=>r);
    await waitForLockWaiters(2); await expire(b,blocker); await blocker.query('COMMIT');
  } finally { await blocker.query('ROLLBACK'); blocker.release(); }
  const [p,h]=await Promise.all([paying,acquiring]); assert.equal(p.status,409); assert.equal(h.status,201);
  assert.equal((await inventory(f))[0].current_booking_id,h.body.data.booking_id);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM payments WHERE booking_id=$1',[b.booking_id])).rows[0].n,0);
});
test('F: concurrent cancellation and acquisition preserve a single current owner',async () => {
  const f=await fixture(),b=(await hold(users[0],f).expect(201)).body.data; await pay(users[0],b).expect(200);
  const [c,h]=await Promise.all([cancel(users[0],b),hold(users[1],f)]);
  assert.equal(c.status,200); assert.ok([201,409].includes(h.status));
  const newer=h.status===201 ? h.body.data : (await hold(users[1],f).expect(201)).body.data;
  await pay(users[1],newer).expect(200);
  assert.equal((await inventory(f))[0].current_booking_id,newer.booking_id);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM booking_seats WHERE show_seat_id=$1 AND active',[f.ids[0]])).rows[0].n,1);
});
test('simultaneous cancellation and payment cannot leave a successful uncancelled charge',async () => {
  const f=await fixture(),b=(await hold(users[0],f).expect(201)).body.data;
  const [p,c]=await Promise.all([pay(users[0],b),cancel(users[0],b)]); assert.ok([200,409].includes(p.status)); assert.equal(c.status,200);
  assert.equal((await inventory(f))[0].status,'AVAILABLE');
  assert.equal((await db.query("SELECT count(*)::int AS n FROM payments WHERE booking_id=$1 AND status='SUCCESS'",[b.booking_id])).rows[0].n,0);
});
test('database partial unique index rejects two active booking-seat owners',async () => {
  const f=await fixture(),b=(await hold(users[0],f).expect(201)).body.data; await pay(users[0],b).expect(200);
  const other=(await db.query('INSERT INTO bookings(show_id,user_id,total_amount) VALUES($1,$2,10.10) RETURNING booking_id',[f.showId,users[1].user_id])).rows[0];
  await assert.rejects(db.query('INSERT INTO booking_seats(booking_id,show_seat_id,show_id,price,active) VALUES($1,$2,$3,10.10,TRUE)',[other.booking_id,f.ids[0],f.showId]),{code:'23505'});
});
test('injected confirmation failure rolls payment, ownership and booking back together',async () => {
  const f=await fixture(),b=(await hold(users[0],f).expect(201)).body.data;
  await db.query("CREATE FUNCTION fail_confirmation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='CONFIRMED' THEN RAISE EXCEPTION 'injected test failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $$");
  await db.query('CREATE TRIGGER test_failure BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION fail_confirmation()');
  try { await pay(users[0],b).expect(409); }
  finally { await db.query('DROP TRIGGER test_failure ON bookings'); await db.query('DROP FUNCTION fail_confirmation()'); }
  assert.equal((await inventory(f))[0].status,'LOCKED');
  assert.equal((await db.query('SELECT status FROM bookings WHERE booking_id=$1',[b.booking_id])).rows[0].status,'PENDING');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM payments WHERE booking_id=$1',[b.booking_id])).rows[0].n,0);
  assert.equal((await db.query('SELECT active FROM booking_seats WHERE booking_id=$1',[b.booking_id])).rows[0].active,false);
  await pay(users[0],b).expect(200);
});
test('simultaneous hold retries create exactly one booking and never renew its deadline',async () => {
  const f=await fixture(),key=randomUUID(),results=await Promise.all(Array.from({length:8},()=>hold(users[0],f,f.ids,key)));
  assert.equal(results.filter(r=>r.status===201).length,1); assert.equal(results.filter(r=>r.status===200).length,7);
  assert.equal(new Set(results.map(r=>r.body.data.booking_id)).size,1); assert.equal(new Set(results.map(r=>r.body.data.expires_at)).size,1);
  const b=results[0].body.data; await expire(b);
  const replay=(await hold(users[0],f,f.ids,key).expect(200)).body.data; assert.equal(replay.status,'EXPIRED');
  assert.ok((await inventory(f)).every(s=>s.status==='AVAILABLE'));
});
test('payment uses snapshotted prices and admin show edits are blocked after a hold',async () => {
  const f=await fixture(),b=(await hold(users[0],f,f.ids).expect(201)).body.data;
  await request(app).patch('/api/shows/'+f.showId).set(headers(users[20])).send({price:'1.00'}).expect(409);
  // Even a privileged out-of-band price change cannot change the agreed total.
  await db.query('UPDATE show_seats SET price=99.99 WHERE show_id=$1',[f.showId]);
  const r=await pay(users[0],b).expect(200); assert.equal(r.body.data.payment.amount,'60.60');
  assert.deepEqual(r.body.data.booking.seats.map(s=>s.price),['10.10','20.20','30.30']);
});
test('bounded lock contention rolls back and permits a safe same-key retry',async () => {
  const f=await fixture(),key=randomUUID(),blocker=await db.connect();
  try {
    await blocker.query('BEGIN'); await blocker.query('SELECT * FROM shows WHERE show_id=$1 FOR UPDATE',[f.showId]);
    const r=await hold(users[0],f,f.ids,key).expect(409); assert.equal(r.body.error.code,'RETRYABLE_CONFLICT');
  } finally { await blocker.query('ROLLBACK'); blocker.release(); }
  assert.equal((await db.query('SELECT count(*)::int AS n FROM bookings WHERE show_id=$1',[f.showId])).rows[0].n,0);
  await hold(users[0],f,f.ids,key).expect(201);
});
test('pending holds cannot confirm when show starts and new holds are rejected',async () => {
  const f=await fixture(),b=(await hold(users[0],f).expect(201)).body.data;
  await db.query("UPDATE shows SET start_time=clock_timestamp()-interval '1 minute' WHERE show_id=$1",[f.showId]);
  await pay(users[0],b).expect(409); await hold(users[1],f).expect(409);
  const status=await request(app).get(`/api/bookings/${b.booking_id}/status`).set(headers(users[0])).expect(200); assert.equal(status.body.data.status,'EXPIRED');
});

// Production-like demo configuration uses the same M2 transaction paths.
function publicDemo() { return createApp(db,{...config,NODE_ENV:'production',PAYMENT_MODE:'demo'}); }
function demoPay(server,user,b,key=randomUUID()) {
  return request(server).post(`/api/bookings/${b.booking_id}/payments`).set(headers(user)).set('Idempotency-Key',key).send({payment_method:'UPI',outcome:'SUCCESS'});
}
test('explicit production demo confirms a pending booking and retries without another charge',async()=>{
  const server=publicDemo(),f=await fixture(),b=(await hold(users[0],f).expect(201)).body.data,key=randomUUID();
  const a=await demoPay(server,users[0],b,key).expect(200),r=await demoPay(server,users[0],b,key).expect(200);
  assert.equal(a.body.data.booking.status,'CONFIRMED');assert.equal(r.body.data.payment.payment_id,a.body.data.payment.payment_id);
  assert.equal(r.body.data.replayed,true);
});
test('public demo cannot confirm missing, cancelled or expired bookings',async()=>{
  const server=publicDemo();
  await demoPay(server,users[0],{booking_id:'9223372036854775807'}).expect(404);
  for(const state of ['expired','cancelled']){
    const f=await fixture(),b=(await hold(users[0],f).expect(201)).body.data;
    if(state==='expired')await expire(b);else await cancel(users[0],b).expect(200);
    await demoPay(server,users[0],b).expect(409);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM payments WHERE booking_id=$1',[b.booking_id])).rows[0].n,0);
  }
});
test('public demo rejects unauthenticated and other-user payment',async()=>{
  const server=publicDemo(),f=await fixture(),b=(await hold(users[0],f).expect(201)).body.data;
  await request(server).post(`/api/bookings/${b.booking_id}/payments`).send({}).expect(401);
  await demoPay(server,users[1],b).expect(403);
});
test('public demo competing customers can confirm only one owner of a seat',async()=>{
  const server=publicDemo(),f=await fixture();
  const responses=await Promise.all([users[0],users[1]].map(user=>request(server).post(`/api/shows/${f.showId}/locks`).set(headers(user)).set('Idempotency-Key',randomUUID()).send({seatIds:[f.ids[0]]})));
  assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);
  const index=responses.findIndex(r=>r.status===201),b=responses[index].body.data;
  const payments=await Promise.all([demoPay(server,users[index],b),demoPay(server,users[1-index],b)]);
  assert.deepEqual(payments.map(r=>r.status).sort(),[200,403]);
  assert.equal((await inventory(f))[0].status,'BOOKED');
});

import {demoSeed} from '../src/db/seeds/demo.js';
test('demo seed is repeatable, extends upcoming screenings and preserves held booking history',async()=>{
  await demoSeed(db);
  const counts=async()=> (await db.query('SELECT (SELECT count(*) FROM movies) AS movies,(SELECT count(*) FROM theatres) AS theatres,(SELECT count(*) FROM shows) AS shows,(SELECT count(*) FROM show_seats) AS seats')).rows[0];
  const initial=await counts();await demoSeed(db);assert.deepEqual(await counts(),initial);
  const targets=(await db.query("SELECT s.show_id FROM shows s JOIN auditoriums a USING(auditorium_id) JOIN theatres t USING(theatre_id) WHERE t.theatre_name LIKE 'Frame Grand%' ORDER BY s.start_time LIMIT 2")).rows;
  const seat=(await db.query('SELECT show_seat_id FROM show_seats WHERE show_id=$1 LIMIT 1',[targets[0].show_id])).rows[0];
  const b=(await hold(users[0],{showId:targets[0].show_id,ids:[seat.show_seat_id]}).expect(201)).body.data;
  await db.query("UPDATE shows SET start_time=start_time-interval '14 days',end_time=end_time-interval '14 days' WHERE show_id=$1",[targets[1].show_id]);
  await demoSeed(db);
  assert.equal(Number((await counts()).shows),Number(initial.shows)+1);
  const saved=(await db.query('SELECT status,total_amount FROM bookings WHERE booking_id=$1',[b.booking_id])).rows[0];
  assert.equal(saved.status,'PENDING');assert.equal(saved.total_amount,b.total_amount);
  assert.equal((await db.query('SELECT current_booking_id FROM show_seats WHERE show_seat_id=$1',[seat.show_seat_id])).rows[0].current_booking_id,b.booking_id);
  const extended=await counts();await demoSeed(db);assert.deepEqual(await counts(),extended);
});

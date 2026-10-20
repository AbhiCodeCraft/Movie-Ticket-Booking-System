import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {readConfig} from '../src/config/env.js';
import {createApp} from '../src/app.js';
import {databaseOptions,migrationURL} from '../src/db/connection.js';

const env={DATABASE_URL:'postgres://unused:unused@localhost/test',JWT_SECRET:'x'.repeat(48),NODE_ENV:'production',CORS_ORIGINS:'https://cinema.example'};
const pool={query:async()=>({rows:[]})};
test('payment mode is explicit in every environment and unknown modes fail closed',()=>{
  for(const NODE_ENV of ['production','development','test']){
    assert.equal(readConfig({...env,NODE_ENV}).PAYMENT_MODE,'disabled');
    assert.equal(readConfig({...env,NODE_ENV,PAYMENT_MODE:'demo'}).PAYMENT_MODE,'demo');
  }
  assert.throws(()=>readConfig({...env,PAYMENT_MODE:'real'}));
});
test('production config rejects insecure origins and unsafe JWT placeholders',()=>{
  assert.throws(()=>readConfig({...env,CORS_ORIGINS:'http://cinema.example'}));
  assert.throws(()=>readConfig({...env,JWT_SECRET:'REPLACE_'+'x'.repeat(40)}));
});
test('Neon uses verified TLS and migrations reject pooled session connections',()=>{
  const opts=databaseOptions('postgres://user:pass@ep-example.neon.tech/db?sslmode=require');
  assert.equal(new URL(opts.connectionString).searchParams.get('sslmode'),'verify-full');
  assert.equal(opts.max,5);
  assert.throws(()=>databaseOptions('postgres://u:p@ep-example.neon.tech/db?ssl=false'));
  assert.throws(()=>migrationURL({DATABASE_URL:'postgres://u:p@ep-example-pooler.neon.tech/db'}));
  assert.equal(migrationURL({DATABASE_URL:'unused',MIGRATION_DATABASE_URL:'postgres://u:p@ep-example.neon.tech/db'}),'postgres://u:p@ep-example.neon.tech/db');
});
test('CORS allows the exact HTTPS frontend and authorization/idempotency preflight',async()=>{
  const app=createApp(pool,readConfig(env));
  const r=await request(app).options('/api/bookings/1/payments').set('Origin',env.CORS_ORIGINS)
    .set('Access-Control-Request-Method','POST').set('Access-Control-Request-Headers','authorization,content-type,idempotency-key').expect(204);
  assert.equal(r.headers['access-control-allow-origin'],env.CORS_ORIGINS);
  assert.match(r.headers['access-control-allow-headers'],/idempotency-key/);
  await request(app).post('/api/auth/login').set('Origin','https://evil.example').send({}).expect(403);
  await request(app).get('/health').expect(200);
});
test('mutation abuse receives structured 429 and untrusted forwarded prefixes cannot evade one-hop limits',async()=>{
  const app=createApp(pool,readConfig({...env,NODE_ENV:'test',TRUST_PROXY_HOPS:'1'}));
  for(let i=0;i<120;i++) await request(app).post('/api/unknown').set('X-Forwarded-For',`192.0.2.${i%250}, 198.51.100.1`).send({}).expect(404);
  const r=await request(app).post('/api/unknown').set('X-Forwarded-For','198.51.100.1').send({}).expect(429);
  assert.equal(r.body.error.code,'RATE_LIMITED');
  await request(app).get('/health').expect(200);
});
test('malformed and oversized JSON return sanitized errors',async()=>{
  const app=createApp(pool,readConfig(env));
  for(const text of ['{broken',JSON.stringify({data:'x'.repeat(33000)})]){
    const r=await request(app).post('/api/auth/login').set('Content-Type','application/json').send(text).expect(400);
    assert.equal(r.body.error.code,'INVALID_BODY');assert.equal(r.body.error.stack,undefined);
  }
});

// Isolated full-stack browser runner. Never migrates or deletes the development DB.
import {Pool} from 'pg';
import {randomBytes,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import bcrypt from 'bcrypt';
import {migrate} from '../src/db/migrate.js';
import {demoSeed} from '../src/db/seeds/demo.js';
import {createApp} from '../src/app.js';
import {readConfig} from '../src/config/env.js';
const database='ticket_m3_e2e_'+randomBytes(12).toString('hex');
const maintenanceURL=new URL(process.env.TEST_ADMIN_URL??process.env.DATABASE_URL);maintenanceURL.pathname='/postgres';
const maintenance=new Pool({connectionString:maintenanceURL.href});
const frontend=fileURLToPath(new URL('../../frontend/',import.meta.url));
let pool,server,vite,created=false;
async function ready(url){for(let i=0;i<100;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error('E2E frontend failed to start');}
try{
  await maintenance.query(`CREATE DATABASE "${database}"`);created=true;
  const target=new URL(maintenanceURL);target.pathname='/'+database;
  pool=new Pool({connectionString:target.href,max:12});await migrate(pool);await demoSeed(pool);
  const password=randomBytes(16).toString('hex'),email=`admin-${randomUUID()}@example.test`;
  await pool.query("INSERT INTO users(name,email,password_hash,role) VALUES('E2E Admin',$1,$2,'ADMIN')",[email,await bcrypt.hash(password,12)]);
  const config=readConfig({...process.env,DATABASE_URL:target.href,NODE_ENV:'test',CORS_ORIGINS:'http://127.0.0.1:5174',JWT_SECRET:randomBytes(48).toString('hex')});
  server=createApp(pool,config).listen(3100,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5174'],{cwd:frontend,stdio:'inherit',env:{...process.env,API_PROXY_TARGET:'http://127.0.0.1:3100'}});
  await ready('http://127.0.0.1:5174');
  const browser=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test'],{cwd:frontend,stdio:'inherit',env:{...process.env,E2E_DB_URL:target.href,E2E_ADMIN_EMAIL:email,E2E_PASSWORD:password}});
  process.exitCode=await new Promise((resolve,reject)=>{browser.once('error',reject);browser.once('exit',code=>resolve(code??1));});
}finally{
  if(vite){vite.kill();await new Promise(resolve=>{if(vite.exitCode!==null)resolve();else vite.once('exit',resolve);});}
  if(server)await new Promise(resolve=>server.close(resolve));
  if(pool)await pool.end();
  if(created){if(!/^ticket_m3_e2e_[a-f0-9]{24}$/.test(database))throw new Error('Unsafe test database name');await maintenance.query(`DROP DATABASE "${database}"`);}
  await maintenance.end();
}

import {Pool} from 'pg';
import {migrate} from '../src/db/migrate.js';
import {demoSeed} from '../src/db/seeds/demo.js';
import {databaseOptions,migrationURL} from '../src/db/connection.js';
const pool=new Pool(databaseOptions(migrationURL(),1));
try{await migrate(pool);if(process.env.NODE_ENV==='development'&&process.env.SEED_DEMO==='true')await demoSeed(pool);}finally{await pool.end();}
await import('../src/server.js');

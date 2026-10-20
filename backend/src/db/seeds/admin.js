import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import {databaseOptions,migrationURL} from '../connection.js';
import { registration } from '../../modules/auth/validation.js';
if (process.env.NODE_ENV !== 'development') throw new Error('Administrator seed is development-only');
const input = registration.parse({ name: process.env.ADMIN_NAME ?? 'Development Admin', email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
const db = new Pool(databaseOptions(migrationURL(),1));
try {
  // Deliberately fail on existing email; never elevate an existing customer silently.
  await db.query("INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'ADMIN')", [input.name,input.email,await bcrypt.hash(input.password,12)]);
  console.log('Development administrator created');
} finally { await db.end(); }

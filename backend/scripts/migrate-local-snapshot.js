import 'dotenv/config';
import mysql from 'mysql2/promise';
import {loadSnapshot,migrateSnapshot,verifySnapshot} from '../src/migration-snapshot.js';

let connection;
try {
  const source = process.argv[2];
  if (!source) throw Error('Pass the path to a verified local backup.');
  const snapshot = loadSnapshot(source);
  connection = await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectTimeout:5000,multipleStatements:false});
  if (!process.argv.includes('--verify-only')) await migrateSnapshot(connection,snapshot);
  await verifySnapshot(connection,snapshot);
  console.log(JSON.stringify({id:snapshot.id,status:'VERIFIED_STAGING_COPY',files:snapshot.files.length,records:snapshot.records.length,users:snapshot.state.users.length,memberships:snapshot.state.memberCommunities.length,liveStorageChanged:false}));
} catch (error) {
  // Do not print mysql errors: some drivers include statement parameters or personal records.
  console.error(JSON.stringify({status:'FAILED',code:/^[A-Z_]+$/.test(error.code||'')?error.code:'MIGRATION_VALIDATION_FAILED'}));
  process.exitCode=1;
} finally { await connection?.end(); }

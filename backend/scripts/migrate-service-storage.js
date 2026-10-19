import 'dotenv/config';
import mysql from 'mysql2/promise';
import {DatabaseSync} from 'node:sqlite';
import {snapshotPath} from '../src/migration-snapshot.js';
import {serviceSnapshot,migrateServiceSnapshot} from '../src/service-migration.js';
let connection,source,live;
try{
  const service=process.argv[2];
  if(!['cycle','heritage'].includes(service)||!process.argv.includes('--api-stopped'))throw Error('Choose a service and pause writers before migration.');
  source=new DatabaseSync(snapshotPath(process.argv[3],`validation/${service}.sqlite`),{readOnly:true});
  live=new DatabaseSync(new URL(`../data/${service}.sqlite`,import.meta.url),{readOnly:true});
  const snapshot=serviceSnapshot(source,service);
  if(serviceSnapshot(live,service).fingerprint!==snapshot.fingerprint)throw Error('Service changed after backup.');
  connection=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
  const counts=await migrateServiceSnapshot(connection,snapshot);
  if(serviceSnapshot(live,service).fingerprint!==snapshot.fingerprint)throw Error('Service changed during migration. Do not activate SQL.');
  console.log(JSON.stringify({status:'SERVICE_MIGRATION_VERIFIED',service,counts,sourceFilesUnchanged:true}));
}catch(error){console.error(JSON.stringify({status:'SERVICE_MIGRATION_FAILED',code:/^[A-Z_]+$/.test(error.code||'')?error.code:'VALIDATION_FAILED'}));process.exitCode=1;}
finally{source?.close();live?.close();await connection?.end();}

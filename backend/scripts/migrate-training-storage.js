import 'dotenv/config';
import mysql from 'mysql2/promise';
import {DatabaseSync} from 'node:sqlite';
import {snapshotPath} from '../src/migration-snapshot.js';
import {trainingSnapshot,migrateTrainingSnapshot} from '../src/training-migration.js';

let connection,source,live;
try{
  if(!process.argv.includes('--api-stopped'))throw Error('Pause Training writers before migration.');
  source=new DatabaseSync(snapshotPath(process.argv[2],'validation/trader-training.sqlite'),{readOnly:true});
  live=new DatabaseSync(new URL('../data/trader-training.sqlite',import.meta.url),{readOnly:true});
  const snapshot=trainingSnapshot(source);
  if(trainingSnapshot(live).fingerprint!==snapshot.fingerprint)throw Error('Training changed after backup.');
  connection=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
  const counts=await migrateTrainingSnapshot(connection,snapshot);
  if(trainingSnapshot(live).fingerprint!==snapshot.fingerprint)throw Error('Training changed during migration. Do not activate SQL.');
  console.log(JSON.stringify({status:'TRAINING_MIGRATION_VERIFIED',counts,sourceFilesUnchanged:true}));
}catch(error){
  console.error(JSON.stringify({status:'TRAINING_MIGRATION_FAILED',code:/^[A-Z_]+$/.test(error.code||'')?error.code:'VALIDATION_FAILED'}));process.exitCode=1;
}finally{source?.close();live?.close();await connection?.end();}

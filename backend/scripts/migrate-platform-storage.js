import 'dotenv/config';
import mysql from 'mysql2/promise';
import {readFileSync} from 'node:fs';
import {loadSnapshot,digest} from '../src/migration-snapshot.js';
import {readSqlDocument,writeSqlDocument,platformDigest} from '../src/mysql-platform-store.js';
let connection;
try {
  if(!process.argv.includes('--api-stopped'))throw Error('Pause platform writers before migration.');
  const snapshot=loadSnapshot(process.argv[2]);
  const source=snapshot.files.find(f=>f.path==='backend/data/platform-store.json');
  if(digest(readFileSync('data/platform-store.json'))!==source.sha256)throw Error('Source changed since backup.');
  const fingerprint=platformDigest(JSON.stringify(snapshot.state));
  connection=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
  await connection.beginTransaction();
  try {
    const [[marker]]=await connection.query('SELECT source_sha256 FROM duranki_platform_migration WHERE id=1 FOR UPDATE');
    if(marker&&marker.source_sha256!==fingerprint)throw Error('Different migration already installed.');
    const counts=Object.fromEntries(Object.entries(snapshot.state).filter(([,v])=>Array.isArray(v)).map(([key,value])=>[key,value.length]));
    if(!marker){
      await writeSqlDocument(connection,'platform',snapshot.state,1);
      await connection.execute('INSERT INTO duranki_platform_migration(id,source_sha256,counts_json) VALUES(1,?,?)',[fingerprint,JSON.stringify(counts)]);
    }
    const copied=await readSqlDocument(connection);
    if(copied.revision!==1 || copied.sha256!==fingerprint || JSON.stringify(copied.state)!==JSON.stringify(snapshot.state))throw Error('Platform verification failed or live writes already exist.');
    await connection.commit();
    const confirmed=await readSqlDocument(connection);
    if(confirmed.sha256!==fingerprint)throw Error('Post-commit verification failed.');
    console.log(JSON.stringify({status:'PLATFORM_MIGRATION_VERIFIED',counts,allFieldsPreserved:true,sourceUnchanged:true}));
  }catch(error){await connection.rollback();throw error;}
}catch(error){console.error(JSON.stringify({status:'PLATFORM_MIGRATION_FAILED',code:/^[A-Z_]+$/.test(error.code||'')?error.code:'VALIDATION_FAILED'}));process.exitCode=1;}
finally{await connection?.end();}

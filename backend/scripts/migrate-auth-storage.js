import 'dotenv/config';
import mysql from 'mysql2/promise';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {digest,snapshotPath} from '../src/migration-snapshot.js';

let connection;
const databases=[];
try {
  if(!process.argv.includes('--api-stopped'))throw Error('Pause authentication writers before migration.');
  const root=process.argv[2];
  const sourceKey=readFileSync(snapshotPath(root,'backend/data/mfa.key'));
  if(digest(sourceKey)!==digest(readFileSync('data/mfa.key')))throw Error('Encryption key mismatch.');
  const mfa=new DatabaseSync(snapshotPath(root,'validation/mfa.sqlite'),{readOnly:true});databases.push(mfa);
  const sessions=new DatabaseSync(snapshotPath(root,'validation/sessions.sqlite'),{readOnly:true});databases.push(sessions);
  const plans=[
    {name:'duranki_mfa_credential',db:mfa,table:'credential',columns:['user_id','secret','version','last_step','recovery']},
    {name:'duranki_mfa_challenge',db:mfa,table:'challenge',columns:['id','user_id','expires','attempts','pending_secret','claims']},
    {name:'duranki_mfa_audit',db:mfa,table:'mfa_audit',columns:['id','user_id','event','created_at']},
    {name:'duranki_auth_session',db:sessions,table:'auth_session',columns:['jti','user_id','expires_at','last_seen','revoked']}
  ].map(plan=>({...plan,rows:plan.db.prepare(`SELECT ${plan.columns.join(',')} FROM ${plan.table} ORDER BY ${plan.columns[0]}`).all()}));
  const fingerprint=digest(JSON.stringify(plans.map(({name,rows})=>({name,rows}))));
  connection=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
  await connection.beginTransaction();
  try {
    const [existing]=await connection.execute('SELECT source_sha256 FROM duranki_auth_migration WHERE id=1 FOR UPDATE');
    if(existing.length&&existing[0].source_sha256!==fingerprint)throw Error('A different auth migration is already installed.');
    const counts={};
    for(const plan of plans){
      const [before]=await connection.query(`SELECT COUNT(*) AS n FROM ${plan.name}`);
      if(!existing.length&&Number(before[0].n)!==0)throw Error('Destination auth tables are not empty.');
      if(!existing.length)for(const row of plan.rows){
        await connection.execute(`INSERT INTO ${plan.name}(${plan.columns.join(',')}) VALUES(${plan.columns.map(()=>'?').join(',')})`,plan.columns.map(column=>row[column]));
      }
      const [copied]=await connection.query(`SELECT ${plan.columns.join(',')} FROM ${plan.name} ORDER BY ${plan.columns[0]}`);
      const canonical=rows=>rows.map(row=>plan.columns.map(column=>row[column]));
      if(JSON.stringify(canonical(copied))!==JSON.stringify(canonical(plan.rows)))throw Error('Authentication row verification failed.');
      counts[plan.name]=copied.length;
    }
    if(!existing.length){
      const users=new Set(plans.flatMap(plan=>plan.rows.map(row=>String(row.user_id))));
      for(const id of users)await connection.execute('INSERT IGNORE INTO duranki_auth_identity(user_id) VALUES(?)',[id]);
      await connection.execute('INSERT INTO duranki_auth_migration(id,source_sha256,key_sha256,counts_json) VALUES(1,?,?,?)',[fingerprint,digest(sourceKey),JSON.stringify(counts)]);
    }
    await connection.commit();
    console.log(JSON.stringify({status:'AUTH_MIGRATION_VERIFIED',counts,keyPreserved:true,sourceFilesUnchanged:true}));
  }catch(error){await connection.rollback();throw error;}
}catch(error){console.error(JSON.stringify({status:'AUTH_MIGRATION_FAILED',code:/^[A-Z_]+$/.test(error.code||'')?error.code:'VALIDATION_FAILED'}));process.exitCode=1;}
finally{for(const db of databases)db.close();await connection?.end();}

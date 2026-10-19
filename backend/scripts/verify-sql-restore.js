import 'dotenv/config';
import mysql from 'mysql2/promise';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {loadSnapshot,verifySnapshot,digest} from '../src/migration-snapshot.js';

let connection;
try {
  const snapshot = loadSnapshot(process.argv[2]);
  connection = await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
  await verifySnapshot(connection,snapshot);
  const root = path.resolve('data/backups',`sql-restore-${Date.now()}`);
  mkdirSync(root,{recursive:false,mode:0o700});
  // Paths come from the already validated source manifest, never from unchecked SQL fields.
  for (const [ordinal,file] of snapshot.files.entries()) {
    const [chunks] = await connection.execute('SELECT contents FROM duranki_migration_chunk WHERE run_id=? AND file_ordinal=? ORDER BY chunk_ordinal',[snapshot.id,ordinal]);
    const bytes=Buffer.concat(chunks.map(chunk=>chunk.contents));
    if (digest(bytes)!==file.sha256) throw Error('Restore hash mismatch.');
    const target=path.resolve(root,file.path);
    if (path.relative(root,target).startsWith('..')) throw Error('Unsafe restore destination.');
    mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
    writeFileSync(target,bytes,{flag:'wx',mode:0o600});
  }
  const state=JSON.parse(readFileSync(path.join(root,'backend/data/platform-store.json'),'utf8'));
  const stores=[];
  for (const file of snapshot.files.filter(file=>file.path.endsWith('.sqlite'))) {
    const restored=new DatabaseSync(path.join(root,file.path));
    const reference=path.join(process.argv[2],'validation',path.basename(file.path));
    if (!existsSync(reference)) throw Error('Missing validated SQLite reference.');
    const original=new DatabaseSync(reference,{readOnly:true});
    try {
      if (restored.prepare('PRAGMA integrity_check').all().some(row=>row.integrity_check!=='ok')) throw Error('SQLite restore integrity failure.');
      const tables=db=>db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(row=>row.name);
      const names=tables(original);
      if(JSON.stringify(names)!==JSON.stringify(tables(restored)))throw Error('Restored SQLite table mismatch.');
      let records=0;
      for(const name of names){
        const sql=`SELECT COUNT(*) AS n FROM "${name.replaceAll('"','""')}"`;
        const before=original.prepare(sql).get().n,after=restored.prepare(sql).get().n;
        if(before!==after)throw Error('Restored SQLite row count mismatch.');
        records+=after;
      }
      stores.push({store:path.basename(file.path),tables:names.length,records,integrity:'ok'});
    } finally {restored.close();original.close();}
  }
  console.log(JSON.stringify({status:'SQL_RESTORE_VERIFIED',destination:root,users:state.users.length,memberships:state.memberCommunities.length,stores,credentialsAndKeys:'retained-in-protected-host-backup-not-SQL'}));
} catch (error) {
  console.error(JSON.stringify({status:'RESTORE_CHECK_FAILED',code:/^[A-Z_]+$/.test(error.code||'')?error.code:'VALIDATION_FAILED'}));
  process.exitCode=1;
} finally {await connection?.end();}

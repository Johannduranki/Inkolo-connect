import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {privateBackupDirectory} from '../src/private-backup-directory.js';

// Stop the API before calling this script so all stores share one recovery point.
if (!process.argv.includes('--api-stopped')) throw Error('Stop the API, then pass --api-stopped.');
const root=fileURLToPath(new URL('../../',import.meta.url));
const data=path.join(root,'backend/data');
const destination=path.join(data,'backups','connection-repair-'+new Date().toISOString().replaceAll(':','-'));
privateBackupDirectory(destination);
const entries=[];
function copy(source,relative){
  const target=path.join(destination,relative);
  if(statSync(source).isDirectory()){
    for(const entry of readdirSync(source,{withFileTypes:true})){
      if(entry.isSymbolicLink())throw Error('Backup refuses symbolic links.');
      copy(path.join(source,entry.name),path.join(relative,entry.name));
    }
    return;
  }
  mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
  cpSync(source,target,{errorOnExist:true,force:false});
  const digest=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
  const hash=digest(source);if(hash!==digest(target))throw Error('Backup hash mismatch: '+relative);
  entries.push({file:relative,bytes:statSync(target).size,sha256:hash});
}
for(const entry of readdirSync(data,{withFileTypes:true})){
  if(entry.name==='backups')continue;
  if(entry.isSymbolicLink())throw Error('Backup refuses symbolic links.');
  copy(path.join(data,entry.name),path.join('backend/data',entry.name));
}
for(const relative of ['backend/.env','.env','backend/uploads','uploads']){
  const source=path.join(root,relative);if(existsSync(source))copy(source,relative);
}
const state=JSON.parse(readFileSync(path.join(destination,'backend/data/platform-store.json'),'utf8'));
const counts=Object.fromEntries(Object.entries(state).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,v.length]));
// Validate a disposable recovery copy; preserve the exact backed-up WAL files.
const checks=[];
for(const entry of entries.filter(e=>e.file.endsWith('.sqlite'))){
  const recovery=path.join(destination,'validation',path.basename(entry.file));
  mkdirSync(path.dirname(recovery),{recursive:true,mode:0o700});
  for(const suffix of ['', '-wal','-shm']){
    const source=path.join(destination,entry.file+suffix);if(existsSync(source))cpSync(source,recovery+suffix);
  }
  const db=new DatabaseSync(recovery);
  try{
    const result=db.prepare('PRAGMA integrity_check').all();
    if(result.some(row=>row.integrity_check!=='ok'))throw Error('SQLite recovery validation failed: '+entry.file);
    checks.push({file:entry.file,integrity:'ok'});
  }finally{db.close();}
}
writeFileSync(path.join(destination,'manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),scope:'Local server data only. MariaDB and browser-local configuration are not included.',counts,sqlite:checks,files:entries},null,2),{mode:0o600});
console.log(JSON.stringify({destination,files:entries.length,users:counts.users,sqlite:checks,verified:true}));

import {readFileSync,writeFileSync,mkdirSync,copyFileSync,readdirSync,renameSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {buildCoreImport} from '../backend/src/core-user-import.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const data=path.join(root,'backend/data'),store=path.join(data,'platform-store.json');
const source=JSON.parse(readFileSync(path.join(root,'tmp/core-import/selected-records.json'),'utf8'));
const original=JSON.parse(readFileSync(store,'utf8'));
const {state,report}=buildCoreImport(original,source);
writeFileSync(path.join(root,'tmp/core-import/apply-report.json'),JSON.stringify(report,null,2));
if(process.argv.includes('--apply')){
  // The backend must be stopped: its in-memory store would overwrite this migration.
  try{await fetch('http://127.0.0.1:3000/api/health',{signal:AbortSignal.timeout(1500)});throw new Error('Stop the backend before applying.');}catch(error){if(error.message==='Stop the backend before applying.')throw error;}
  const backup=path.join(data,'backups',new Date().toISOString().replaceAll(':','-'));
  mkdirSync(backup,{recursive:true});
  for(const file of readdirSync(data,{withFileTypes:true}))if(file.isFile())copyFileSync(path.join(data,file.name),path.join(backup,file.name));
  writeFileSync(path.join(data,'core-import-report.json'),JSON.stringify(report,null,2));
  writeFileSync(store+'.importing',JSON.stringify(state,null,2));renameSync(store+'.importing',store);
  writeFileSync(path.join(data,'import-mode.json'),JSON.stringify({demoUsersDisabled:true}));
  const removed=report.removedDemoIds;
  for(const [filename,table,key] of [['treasury.sqlite','staff','user_id'],['mfa.sqlite','credential','user_id'],['mfa.sqlite','challenge','user_id']]){
    const target=path.join(data,filename);if(!existsSync(target))continue;
    const db=new DatabaseSync(target);try{if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table))for(const id of removed)db.prepare(`DELETE FROM ${table} WHERE ${key}=?`).run(id);}finally{db.close();}
  }
  console.log('Backup: '+backup);
}
console.log(JSON.stringify({...report,review:report.review.length+' review entries'},null,2));

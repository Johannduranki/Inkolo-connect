import {digest} from './migration-snapshot.js';

const tables = [
  ['programme','programme',['id','community_id','name','state','revision','modules','created_at']],
  ['attempt','attempt',['id','programme_id','user_id','module_id','score','passed','created_at']],
  ['entitlement','entitlement',['id','programme_id','user_id','module_id','amount_cents','status','created_at']],
  ['training_audit','audit',['id','actor','action','record_id','created_at']]
];
export function trainingSnapshot(db) {
  if (db.prepare('PRAGMA integrity_check').all().some(row=>row.integrity_check!=='ok') || db.prepare('PRAGMA foreign_key_check').all().length) throw Error('Training source integrity check failed.');
  const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name).filter(name=>!name.startsWith('sqlite_')).sort();
  if(JSON.stringify(names)!==JSON.stringify(tables.map(([name])=>name).sort()))throw Error('Unexpected Training tables require migration review.');
  for(const [source,,columns] of tables){
    const actual=db.prepare(`PRAGMA table_info(${source})`).all().map(row=>row.name).sort();
    if(JSON.stringify(actual)!==JSON.stringify([...columns].sort()))throw Error('Unexpected Training fields require migration review.');
  }
  const plans=tables.map(([source,target,columns])=>({target,columns,rows:db.prepare(`SELECT ${columns.join(',')} FROM ${source} ORDER BY ${columns[0]}`).all()}));
  const programmeIds=new Set(plans[0].rows.map(row=>row.id));
  for (const plan of plans.slice(1,3)) if(plan.rows.some(row=>!programmeIds.has(row.programme_id))) throw Error('Training record has no programme.');
  for (const row of plans[0].rows) if(!Array.isArray(JSON.parse(row.modules))) throw Error('Invalid training modules.');
  return {plans,fingerprint:digest(JSON.stringify(plans))};
}
export async function verifyTrainingSnapshot(connection,snapshot) {
  const counts={};
  for(const plan of snapshot.plans){
    const table=`duranki_training_${plan.target}`;
    const [rows]=await connection.query(`SELECT ${plan.columns.join(',')} FROM ${table}`);
    const canonical=values=>values.map(row=>JSON.stringify(plan.columns.map(column=>row[column]))).sort();
    if(JSON.stringify(canonical(rows))!==JSON.stringify(canonical(plan.rows)))throw Error('Training row verification failed.');
    counts[table]=rows.length;
  }
  return counts;
}
export async function migrateTrainingSnapshot(connection,snapshot){
  await connection.beginTransaction();
  try{
    const [[existing]]=await connection.query('SELECT source_sha256 FROM duranki_training_migration WHERE id=1 FOR UPDATE');
    if(existing&&existing.source_sha256!==snapshot.fingerprint)throw Error('A different Training migration already exists.');
    if(!existing)for(const plan of snapshot.plans){
      const table=`duranki_training_${plan.target}`;
      const [[before]]=await connection.query(`SELECT COUNT(*) AS n FROM ${table}`);
      if(Number(before.n))throw Error('Training destination is not empty.');
      for(const row of plan.rows)await connection.execute(`INSERT INTO ${table}(${plan.columns.join(',')}) VALUES(${plan.columns.map(()=>'?').join(',')})`,plan.columns.map(column=>row[column]));
    }
    const counts=await verifyTrainingSnapshot(connection,snapshot);
    if(!existing)await connection.execute('INSERT INTO duranki_training_migration(id,source_sha256,counts_json) VALUES(1,?,?)',[snapshot.fingerprint,JSON.stringify(counts)]);
    await connection.commit();
    // Validate the committed rows, not only the uncommitted transaction view.
    await verifyTrainingSnapshot(connection,snapshot);
    return counts;
  }catch(error){await connection.rollback().catch(()=>{});throw error;}
}

import {digest} from './migration-snapshot.js';

const definitions={
  cycle:[
    ['cycle_request','id user_id tenant_id community_id description amount_cents currency mode status review_required provider_id reference created_by created_at charged_at'],
    ['cycle_event','hash request_id status received_at'],
    ['cycle_audit','id request_id actor action created_at'],
    ['cycle_subscription','id user_id tenant_id community_id service_code amount_cents price_revision price_snapshot mode state consent_version consented_at token paid_until cancelled_at created_at'],
    ['cycle_intent','request_id purpose subscription_id period_start client_key user_id'],
    ['cycle_fulfilment','request_id applied_at'],
    ['cycle_dispatch','request_id state created_at'],
    ['cycle_consent','request_id user_id version amount_cents accepted_at']
  ],
  heritage:[
    ['catalogue','service_id name'],
    ['tenant_service','tenant_id service_id enabled'],
    ['community_service','community_id tenant_id name enabled'],
    ['verifier','user_id tenant_id community_id'],
    ['tree','tree_id tenant_id community_id owner_user_id name created_at'],
    ['person','person_id tree_id tenant_id community_id owner_user_id claimed_user_id display_name name_key birth_date death_date notes privacy verification version created_at'],
    ['relationship','relationship_id tree_id from_person_id to_person_id type kind created_by'],
    ['invitation','invitation_id person_id target_user_id token_hash expires_at used_at created_by'],
    ['leadership','leadership_id person_id tree_id title royal_house clan reign_from reign_to notes'],
    ['succession','succession_id tree_id predecessor_id successor_id office effective_on notes'],
    ['document','document_id person_id filename mime content uploaded_by created_at'],
    ['verification_history','id person_id status evidence actor_user_id created_at'],
    ['audit','id actor action record_id created_at'],
    ['duplicate_review','person_id reason actor'],
    ['enrolment','user_id tenant_id community_id service_id status created_at']
  ]
};
const value=v=>ArrayBuffer.isView(v)?{bytes:Buffer.from(v.buffer,v.byteOffset,v.byteLength).toString('base64')}:v;
const canonical=(columns,rows)=>rows.map(row=>JSON.stringify(columns.map(c=>value(row[c])))).sort();
export function serviceSnapshot(db,service){
  const tables=definitions[service];if(!tables)throw Error('Unsupported service migration.');
  if(db.prepare('PRAGMA integrity_check').all().some(r=>r.integrity_check!=='ok')||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Service source integrity check failed.');
  const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name).filter(n=>!n.startsWith('sqlite_')).sort();
  if(JSON.stringify(names)!==JSON.stringify(tables.map(([n])=>n).sort()))throw Error('Unexpected service tables require review.');
  const plans=tables.map(([source,fields])=>{
    const columns=fields.split(' '),actual=db.prepare(`PRAGMA table_info(${source})`).all().map(r=>r.name).sort();
    if(JSON.stringify(actual)!==JSON.stringify([...columns].sort()))throw Error('Unexpected service fields require review.');
    return {target:service==='heritage'?`heritage_${source}`:source,columns,rows:db.prepare(`SELECT ${columns.join(',')} FROM ${source}`).all()};
  });
  return {service,plans,fingerprint:digest(JSON.stringify(plans.map(p=>({target:p.target,columns:p.columns,rows:canonical(p.columns,p.rows)}))))};
}
export async function verifyServiceSnapshot(connection,snapshot){
  const counts={};
  for(const plan of snapshot.plans){
    const [rows]=await connection.query(`SELECT ${plan.columns.join(',')} FROM ${plan.target}`);
    if(JSON.stringify(canonical(plan.columns,rows))!==JSON.stringify(canonical(plan.columns,plan.rows)))throw Error('Service row verification failed.');
    counts[plan.target]=rows.length;
  }
  return counts;
}
export async function migrateServiceSnapshot(connection,snapshot){
  await connection.beginTransaction();
  try{
    const [locks]=await connection.execute('SELECT service FROM duranki_service_write_lock WHERE service=? FOR UPDATE',[snapshot.service]);
    if(locks.length!==1)throw Error('Service schema is not prepared.');
    const [[existing]]=await connection.execute('SELECT source_sha256 FROM duranki_service_migration WHERE service=? FOR UPDATE',[snapshot.service]);
    if(existing&&existing.source_sha256!==snapshot.fingerprint)throw Error('A different service migration exists.');
    if(!existing)for(const plan of snapshot.plans){
      const [[before]]=await connection.query(`SELECT COUNT(*) AS n FROM ${plan.target}`);
      if(Number(before.n))throw Error('Service destination is not empty.');
      for(const row of plan.rows)await connection.execute(`INSERT INTO ${plan.target}(${plan.columns.join(',')}) VALUES(${plan.columns.map(()=>'?').join(',')})`,plan.columns.map(c=>ArrayBuffer.isView(row[c])?Buffer.from(row[c]):row[c]));
    }
    const counts=await verifyServiceSnapshot(connection,snapshot);
    if(!existing)await connection.execute('INSERT INTO duranki_service_migration(service,source_sha256,counts_json) VALUES(?,?,?)',[snapshot.service,snapshot.fingerprint,JSON.stringify(counts)]);
    await connection.commit();
    await verifyServiceSnapshot(connection,snapshot);
    return counts;
  }catch(error){await connection.rollback().catch(()=>{});throw error;}
}

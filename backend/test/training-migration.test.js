import test from 'node:test';
import assert from 'node:assert/strict';
import {TrainingStore} from '../src/trader-training.js';
import {trainingSnapshot,verifyTrainingSnapshot} from '../src/training-migration.js';

test('Training migration fingerprints all records and refuses silent field loss',async t=>{
  const store=new TrainingStore(':memory:');t.after(()=>store.db.close());
  const draft=store.create({id:'test-community',name:'Synthetic'},'test-admin');
  const before=trainingSnapshot(store.db);assert.equal(before.plans.reduce((n,p)=>n+p.rows.length,0),2);
  assert.equal(trainingSnapshot(store.db).fingerprint,before.fingerprint);
  const p=store.save(draft.id,{name:draft.name,revision:1,publish:true,modules:draft.modules.map(m=>({...m,amountCents:100}))},'test-admin');
  store.attempt(p.id,'test-member','module-1',Object.fromEntries(p.modules[0].questions.map(q=>[q.id,q.correctIndex])));
  const after=trainingSnapshot(store.db);assert.notEqual(after.fingerprint,before.fingerprint);
  const connection={query:async sql=>{const plan=after.plans.find(p=>sql.endsWith('duranki_training_'+p.target));return [plan.rows.map(row=>({...row}))];}};
  const counts=await verifyTrainingSnapshot(connection,after);assert.equal(counts.duranki_training_entitlement,1);
  await assert.rejects(verifyTrainingSnapshot({query:async()=>[[]]},after),/verification failed/);
  store.db.exec('ALTER TABLE programme ADD COLUMN important_note TEXT');
  assert.throws(()=>trainingSnapshot(store.db),/fields require migration review/);
});
test('Training migration refuses orphaned progress rather than discarding it',t=>{
  const store=new TrainingStore(':memory:');t.after(()=>store.db.close());
  store.db.prepare('INSERT INTO attempt VALUES(?,?,?,?,?,?,?)').run('test','missing','member','module-1',100,1,'2026-01-01');
  assert.throws(()=>trainingSnapshot(store.db),/no programme/);
});

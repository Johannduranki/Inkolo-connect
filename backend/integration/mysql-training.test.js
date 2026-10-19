import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {MysqlTrainingStore} from '../src/mysql-training-store.js';

test('MariaDB Training preserves ordered learning, atomic grants and private answers',async t=>{
  const pool=mysql.createPool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectionLimit:4});
  const store=new MysqlTrainingStore(pool),id=`sql-training-test-${randomUUID()}`;
  t.after(async()=>{
    try{
      for(const table of ['attempt','entitlement'])await pool.execute(`DELETE r FROM duranki_training_${table} r JOIN duranki_training_programme p ON r.programme_id=p.id WHERE p.community_id=?`,[id]);
      await pool.execute('DELETE FROM duranki_training_programme WHERE community_id=?',[id]);
      await pool.execute('DELETE FROM duranki_training_audit WHERE actor=?',[id]);
    }finally{await pool.end();}
  });
  const draft=await store.create({id,name:'Synthetic test only'},id);
  assert.equal(draft.modules.length,5);assert.ok(draft.modules.every(m=>m.amountCents===null));
  await assert.rejects(store.create({id,name:'Duplicate'},id),{status:409});
  await assert.rejects(store.save(draft.id,{name:draft.name,revision:1,publish:true,modules:draft.modules},id),{status:400});
  assert.equal((await store.get(draft.id)).revision,1);
  const input={name:draft.name,revision:1,publish:false,modules:draft.modules};
  const edits=await Promise.allSettled([store.save(draft.id,input,id),store.save(draft.id,input,id)]);
  assert.equal(edits.filter(r=>r.status==='fulfilled').length,1);
  const p=await store.save(draft.id,{...input,revision:2,publish:true,modules:draft.modules.map(m=>({...m,amountCents:12345}))},id);
  await assert.rejects(store.save(p.id,{...input,revision:3},id),{status:409});
  const answer=m=>Object.fromEntries(m.questions.map(q=>[q.id,q.correctIndex]));
  await assert.rejects(store.attempt(p.id,id,'module-2',answer(p.modules[1])),{status:409});
  const wrong=answer(p.modules[0]);wrong.q1=(wrong.q1+1)%p.modules[0].questions[0].options.length;
  assert.equal((await store.attempt(p.id,id,'module-1',wrong)).passed,false);
  assert.equal((await store.grants(p.id,id)).length,0);
  const view=await store.memberView(p,id);assert.equal(JSON.stringify(view).includes('correctIndex'),false);assert.equal(view.modules[1].content,'');
  const results=await Promise.all([store.attempt(p.id,id,'module-1',answer(p.modules[0])),store.attempt(p.id,id,'module-1',answer(p.modules[0]))]);
  assert.equal(results.filter(r=>r.alreadyCompleted).length,1);assert.equal((await store.grants(p.id,id)).length,1);
  const failing=new MysqlTrainingStore(pool);failing.audit=async()=>{throw Error('synthetic audit failure');};
  await assert.rejects(failing.attempt(p.id,id,'module-2',answer(p.modules[1])),/synthetic audit failure/);
  assert.equal((await store.grants(p.id,id)).length,1);
  for(const m of p.modules.slice(1))await store.attempt(p.id,id,m.id,answer(m));
  const done=await store.memberView(p,id);assert.equal(done.completedModules,5);assert.equal(done.unlockedAmountCents,61725);assert.ok(done.grants.every(g=>g.status==='ELIGIBLE'));
  assert.equal((await store.grants(p.id,'not-this-member')).length,0);
  const [[attempts]]=await pool.execute('SELECT COUNT(*) AS n FROM duranki_training_attempt WHERE programme_id=?',[p.id]);assert.equal(attempts.n,6);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {HeritageStore} from '../src/heritage-store.js';
import {CycleStore} from '../src/cycle-pay.js';
import {CycleBilling} from '../src/cycle-billing.js';
import {serviceSnapshot,verifyServiceSnapshot} from '../src/service-migration.js';

test('Cycle migration inventories every billing field and rejects unexpected tables',async t=>{
  const store=new CycleStore(':memory:');t.after(()=>store.db.close());new CycleBilling({store});
  const snapshot=serviceSnapshot(store.db,'cycle');assert.equal(snapshot.plans.length,8);
  store.create({userId:'u',tenantId:'t',communityId:'c',amountCents:100,description:'Synthetic',reference:'test'},'u','sandbox');
  assert.notEqual(serviceSnapshot(store.db,'cycle').fingerprint,snapshot.fingerprint);
  store.db.exec('CREATE TABLE unexpected(id TEXT)');assert.throws(()=>serviceSnapshot(store.db,'cycle'),/Unexpected service tables/);
});
test('Heritage migration verifies binary evidence byte-for-byte across database drivers',async t=>{
  const store=new HeritageStore(':memory:');t.after(()=>store.db.close());
  const actor={id:'u',name:'Synthetic',platform:true,scopes:[]};
  store.configure(actor,[{tenant_id:'t',community_id:'c',name:'Synthetic'}],{tenant_id:'t',community_id:'c',tenant_enabled:true,enabled:true});
  const tree=store.createTree(actor,{community_id:'c',name:'Synthetic'});
  store.run('INSERT INTO document VALUES(?,?,?,?,?,?,?)','d',tree.person_id,'test.pdf','application/pdf',Buffer.from([0,255,1,128]),'u','2026-01-01');
  const snapshot=serviceSnapshot(store.db,'heritage');assert.equal(snapshot.plans.length,15);
  const connection={query:async sql=>{const p=snapshot.plans.find(p=>sql.endsWith('FROM '+p.target));return [p.rows.map(r=>({...r,...(r.content?{content:Buffer.from(r.content)}:{})}))];}};
  assert.equal((await verifyServiceSnapshot(connection,snapshot)).heritage_document,1);
  const original=connection.query;connection.query=async sql=>{const result=await original(sql);if(sql.endsWith('FROM heritage_document'))result[0][0].content=Buffer.from([0]);return result;};
  await assert.rejects(verifyServiceSnapshot(connection,snapshot),/row verification/);
  store.db.exec('ALTER TABLE person ADD COLUMN extra TEXT');assert.throws(()=>serviceSnapshot(store.db,'heritage'),/Unexpected service fields/);
});

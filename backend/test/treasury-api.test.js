import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { TreasuryStore } from '../src/treasury-store.js';
import { createTreasuryRouter } from '../src/treasury-api.js';
import { verifyPassword } from '../src/password-security.js';

test('API permissions, staff credentials and full receipt-to-settlement lifecycle', async t=>{
  const store=new TreasuryStore(':memory:');
  const app=express();app.use(express.json());
  const users={admin:{status:'active',roles:['Platform Admin']},maker:{status:'active',roles:['Treasury Operator']},checker:{status:'active',roles:['Treasury Approver']},member:{status:'active',roles:['Member']}};
  app.use('/treasury',createTreasuryRouter({store,requireAuth:(req,res,next)=>{const sub=req.get('authorization');if(!sub)return res.sendStatus(401);req.auth={sub};next();},resolveUser:id=>users[id],findUser:id=>users[id]}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>{server.closeAllConnections();server.close();store.db.close();});
  const request=(path='',actor='admin',body)=>fetch(`http://127.0.0.1:${server.address().port}/treasury${path}`,{method:body?'POST':'GET',headers:{...(actor?{authorization:actor}:{}),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  assert.equal((await request('',null)).status,401);
  assert.equal((await request('','member')).status,403);
  assert.equal((await request('/scopes','maker',{})).status,403);
  const scope=await (await request('/scopes','admin',{tenant_id:'t',tenant_name:'Tenant',community_id:'c',community_name:'Community'})).json();
  const party=await (await request('/parties','admin',{name:'Funeral Provider',service_id:'funeral',beneficiary_reference:'BANK-BENEFICIARY',share_bps:8000})).json();
  const receiptBody={scope_id:scope.id,party_id:party.id,user_id:'member',member_name:'Test Member',reference:'TEST-ONLY',received_cents:10000,received_on:'2026-01-01'};
  const receipt=await (await request('/receipts','maker',receiptBody)).json();
  assert.ok(receipt.id);
  assert.equal((await request('/receipts','maker',receiptBody)).status,409);
  const payment=await (await request('/payments','maker',{receipt_ids:[receipt.id]})).json();
  assert.equal((await request(`/payments/${payment.id}/approve`,'maker',{})).status,403);
  assert.equal((await request(`/payments/${payment.id}/instruction`,'maker')).status,409);
  assert.equal((await request(`/payments/${payment.id}/approve`,'checker',{})).status,200);
  assert.match(await (await request(`/payments/${payment.id}/instruction`,'checker')).text(),/80\.00/);
  assert.equal((await request(`/payments/${payment.id}/settle`,'checker',{bank_reference:'TEST-BANK',settled_on:'2026-01-02'})).status,200);
  const result=await (await request()).json();assert.equal(result.payments[0].amount_cents,8000);assert.equal(result.receipts[0].status,'SETTLED');
  assert.equal((await request('/staff','maker',{user_id:'member',role:'Treasury Approver',password:'test-only-long-password'})).status,403);
  assert.equal((await request('/staff','admin',{user_id:'member',role:'Treasury Approver',password:'short-password'})).status,400);
  assert.equal(store.get('SELECT * FROM staff WHERE user_id=?','member'),undefined);
  assert.equal((await request('/staff','admin',{user_id:'member',role:'Treasury Approver',password:'test-only-long-password'})).status,201);
  assert.ok(await verifyPassword('test-only-long-password',store.get('SELECT * FROM staff WHERE user_id=?','member').password_hash));
  assert.ok(!JSON.stringify(await (await request()).json()).includes('password_hash'));
  assert.equal((await request('/staff/member/revoke','admin',{})).status,200);
  assert.equal(store.get('SELECT * FROM staff WHERE user_id=?','member').version,'revoked');
  assert.ok(await verifyPassword('test-only-long-password',store.get('SELECT * FROM staff WHERE user_id=?','member').password_hash));
});

test('Treasury staff assignment rechecks actor and target after asynchronous password hashing',async t=>{
  let actorCalls=0,targetCalls=0,writes=0,mode='actor';
  const app=express();app.use(express.json());
  app.use('/treasury',createTreasuryRouter({
    requireAuth:(req,res,next)=>{req.auth={sub:'admin'};next();},
    resolveUser:async()=>({status:'active',roles:++actorCalls>1&&mode==='actor'?['Member']:['Platform Admin']}),
    findUser:async()=>({status:++targetCalls>1&&mode==='target'?'inactive':'active',roles:['Member']}),
    store:{assignStaff:async()=>{writes++;}}
  }));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>{server.closeAllConnections();server.close();});
  const request=()=>fetch(`http://127.0.0.1:${server.address().port}/treasury/staff`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:'member',role:'Treasury Operator',password:'test-only-long-password'})});
  assert.equal((await request()).status,403);
  mode='target';actorCalls=0;targetCalls=0;
  assert.equal((await request()).status,409);assert.equal(writes,0);
});

test('Treasury API awaits asynchronous storage and never leaks SQL errors',async t=>{
  const store={snapshot:async()=>{throw Object.assign(Error('SELECT secret FROM private_table; connection credentials'),{code:'ECONNREFUSED'});}};
  const app=express();app.use('/treasury',createTreasuryRouter({store,requireAuth:(req,res,next)=>{req.auth={sub:'test'};next();},resolveUser:async()=>({status:'active',roles:['Platform Admin']})}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>{server.closeAllConnections();server.close();});
  const response=await fetch(`http://127.0.0.1:${server.address().port}/treasury`);
  assert.equal(response.status,503);
  assert.doesNotMatch(await response.text(),/secret|SELECT|credentials|private_table/);
});

import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const root = realpathSync(process.argv[2]);
const read = f => JSON.parse(readFileSync(path.join(root, f)));
assert.equal(read('manifest.json').root, root);
assert.equal(read('sql-isolated/prepared.json').syntheticOnly, true);
assert.equal(read('running.json').port, 4309);
const sql = read('sql-isolated/app.private.json');
assert.equal(sql.port, 13308);
const require = createRequire(path.join(root, 'backend/package.json'));
const db = await require('mysql2/promise').createConnection({host:'127.0.0.1',port:sql.port,user:sql.user,password:sql.password,database:sql.database});
const { readSqlDocument } = await import(pathToFileURL(path.join(root,'backend/src/mysql-platform-store.js')));
const tokens = {};
async function request(actor, route, body, expected=200, method=body ? 'POST' : 'GET') {
  const res = await fetch('http://127.0.0.1:4309'+route, {method,signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json',...(tokens[actor]?{Authorization:'Bearer '+tokens[actor]}:{})},body:body?JSON.stringify(body):undefined});
  assert.equal(res.status,expected,route+': '+res.status);
  return res.status===204?null:res.json();
}
try {
  const [[identity]] = await db.query('SELECT @@datadir AS data');
  assert.equal(realpathSync(identity.data).toLowerCase(),realpathSync(sql.data).toLowerCase());
  const initial=(await readSqlDocument(db)).state;
  const accounts=read('accounts.private.json'),mfa=read('mfa.private.json'),{authenticator}=require('@otplib/v12-adapter');
  for(const actor of ['platform','tenant-a','member-a','multi-member']) {
    const a=accounts.find(a=>a.name===actor);
    let login=await request(null,'/api/auth/login',{telephoneNumber:a.telephoneNumber,password:a.password});
    tokens[actor]=login.accessToken;
    if(login.mfaRequired) {login=await request(actor,'/api/auth/mfa/verify',{code:authenticator.generate(mfa[actor].secret)});tokens[actor]=login.accessToken;}
  }
  const policy=structuredClone(initial.cycleServiceAvailability);
  for(const scope of [...policy.tenants,...policy.communities]) if(['tenant-stage-a','community-stage-a'].includes(scope.id)) scope.serviceCodes=[...new Set([...scope.serviceCodes,'marketplace'])];
  await request('platform','/api/cycle/availability',policy,200,'PUT');
  const command=(actor,action,body,expected=200)=>request(actor,'/api/wholesalers/'+action,body,expected);
  const supplier=await command('tenant-a','supplier',{tenantId:'tenant-stage-a',name:'Synthetic wholesale acceptance',contact:'Manual test only',active:true});
  const offer=await command('tenant-a','offer',{supplierId:supplier.id,product:'Synthetic rice carton',unit:'carton',unitPriceCents:10000,discountBps:1000,thresholdType:'quantity',threshold:10,closesAt:new Date(Date.now()+86400000).toISOString()});
  for(const actor of ['member-a','multi-member']) {
    const app=await command(actor,'apply',{communityId:'community-stage-a',supplierId:supplier.id,businessName:'Synthetic '+actor});
    await command('tenant-a','review',{id:app.id,status:'approved',supplierReference:'TEST-'+actor});
  }
  const body={communityId:'community-stage-a',offerId:offer.id,quantity:4,mode:'group',requestId:randomUUID()};
  const first=await command('member-a','order',body);
  assert.equal((await command('member-a','order',body)).id,first.id);
  await command('multi-member','order',{...body,quantity:6,requestId:randomUUID()});
  await command('tenant-a','close-group',{offerId:offer.id,communityId:'community-stage-a'});
  let view=await request('member-a','/api/wholesalers?communityId=community-stage-a');
  assert.equal(view.discountEligible,false);
  assert.equal(view.orders.find(o=>o.id===first.id).quote.totalCents,40000);
  assert.ok(view.orders.every(o=>o.userId==='91004'));
  await command('tenant-a','status',{id:first.id,status:'submitted_manual',supplierReference:'TEST-MANUAL-ORDER'});
  await command('tenant-a','status',{id:first.id,status:'fulfilled'});
  await request('tenant-a','/api/wholesalers?tenantId=tenant-stage-b',undefined,403);
  const saved=(await readSqlDocument(db)).state;
  assert.equal(saved.wholesalerOrders.orders.find(o=>o.id===first.id).status,'fulfilled');
  for(const key of ['users','wallets','walletTransactions','tenantStaff','providerAccessGrants']) assert.deepEqual(saved[key],initial[key]);
  const result={passed:true,at:new Date().toISOString(),checks:['SQL supplier/offer configuration','Two approved synthetic trader accounts','Unpaid pooled orders retain normal prices; idempotency','Manual submission and fulfilment','Tenant boundary and member privacy','Existing users, wallets and permissions unchanged'],scope:'Isolated synthetic MariaDB 13308 / API 4309; no live changes or payments'};
  writeFileSync(path.join(root,'sql-isolated/wholesaler-acceptance.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
} finally {
  for(const actor of Object.keys(tokens)) await request(actor,'/api/auth/logout',{},204).catch(()=>{});
  await db.end();
}

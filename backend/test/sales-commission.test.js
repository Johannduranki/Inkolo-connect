import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { salesCommission, saveSalesCommission, salesCommissionQuote } from '../src/sales-commission.js';
import { createServicePricingRouter } from '../src/service-pricing.js';

const fixture=()=>({users:[{id:'admin',roles:['Platform Admin'],status:'active'},{id:'staff',roles:['Tenant Staff'],status:'active'}],tenantAccessDirectory:[{id:'tenant-a',name:'Tenant A'}],tenantStaff:[{userId:'staff',tenantId:'tenant-a',status:'active',permissions:['services.manage']}],servicePricing:{marketplace:{mode:'paid',amountCents:1000,revision:1}},serviceSubscriptions:[{userId:'1',amountCents:1000}],wallets:[{balance:500}],marketplaceListings:[{price:1000,status:'sold'}]});
test('independent percentages calculate on sale price with cent rounding and no financial writes',()=>{
  const state=fixture(),before=structuredClone(state);
  saveSalesCommission(state,'admin','marketplace',{rateBps:100,revision:0});
  saveSalesCommission(state,'admin','keycha-properties',{rateBps:250,revision:0});
  assert.equal(salesCommissionQuote(state,'marketplace',100000).durankiCents,1000);
  const property=salesCommissionQuote(state,'keycha-properties',200000000);
  assert.equal(property.durankiCents,5000000);assert.equal(property.sellerRemainderCents,195000000);
  assert.equal(property.estimate,true);assert.equal(property.collection,'not-connected');
  assert.equal(salesCommissionQuote(state,'marketplace',50).durankiCents,1);
  assert.equal(salesCommissionQuote(state,'marketplace',49).durankiCents,0);
  for(const key of Object.keys(before))assert.deepEqual(state[key],before[key]);
  assert.equal(state.salesCommissionAudit.length,2);
});
test('only active platform administrators can set commission; stale and invalid values rejected',()=>{
  const s=fixture();
  assert.throws(()=>saveSalesCommission(s,'staff','marketplace',{rateBps:100,revision:0}),{status:403});
  for(const rateBps of [-1,10001,1.5,'100',null,Infinity])assert.throws(()=>saveSalesCommission(s,'admin','marketplace',{rateBps,revision:0}),{status:400});
  assert.throws(()=>saveSalesCommission(s,'admin','wallet',{rateBps:100,revision:0}),{status:404});
  assert.throws(()=>salesCommissionQuote(s,'marketplace',1000),{status:409});
  saveSalesCommission(s,'admin','marketplace',{rateBps:0,revision:0});assert.equal(salesCommissionQuote(s,'marketplace',100000).durankiCents,0);
  assert.throws(()=>saveSalesCommission(s,'admin','marketplace',{rateBps:100,revision:0}),{status:409});
  for(const value of [-1,1.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>salesCommissionQuote(s,'marketplace',value),{status:400});
  s.users[0].status='inactive';assert.throws(()=>saveSalesCommission(s,'admin','marketplace',{rateBps:100,revision:1}),{status:403});
});
test('commission API exposes estimates and enforces platform-only settings',async t=>{
  const s=fixture(),app=express();app.use(express.json());app.use('/pricing',createServicePricingRouter({requireAuth:(req,res,next)=>{if(!req.get('x-user'))return res.sendStatus(401);req.auth={sub:req.get('x-user')};next();},resolveUser:async id=>s.users.find(u=>u.id===id),readState:()=>s,updateState:fn=>fn(s)}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.closeAllConnections();server.close();});
  const call=(user,path,body)=>fetch(`http://127.0.0.1:${server.address().port}/pricing${path}`,{method:body?'PUT':'GET',headers:{'x-user':user,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  const body={rateBps:100,revision:0};
  assert.equal((await call('','/marketplace/commission',body)).status,401);
  assert.equal((await call('staff','/marketplace/commission',body)).status,403);
  assert.equal((await call('admin','/marketplace/commission?tenantId=tenant-a',body)).status,403);
  assert.equal((await call('admin','/marketplace/commission',body)).status,200);
  const quote=await(await call('staff','/marketplace/commission-quote?salePriceCents=100000')).json();assert.equal(quote.durankiCents,1000);assert.equal(quote.sellerRemainderCents,99000);
  assert.equal((await call('staff','/marketplace/commission-quote?salePriceCents=1.1')).status,400);
  assert.equal((await call('staff','?tenantId=tenant-a')).status,200);
  const rows=await(await call('staff','?tenantId=tenant-a')).json();assert.ok(rows.services.every(row=>!('salesCommission' in row)&&!('costCents' in row)&&!('shares' in row)));
  assert.equal(salesCommission(s,'keycha-properties').rateBps,null);
});

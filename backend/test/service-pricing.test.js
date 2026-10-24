import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServicePricingRouter, configuredSubscriptionPlan, marginAllocation } from '../src/service-pricing.js';
test('margin shares conserve cents, allocate only positive margin and handle fractional percentages',()=>{
  const shares={community:2500,tenant:2500,duranki:5000};
  assert.deepEqual(marginAllocation(10000,6000,shares),{marginCents:4000,allocations:{community:1000,tenant:1000,duranki:2000}});
  assert.deepEqual(marginAllocation(0,6000,shares),{marginCents:-6000,allocations:{community:0,tenant:0,duranki:0}});
  assert.deepEqual(marginAllocation(6000,6000,shares).allocations,{community:0,tenant:0,duranki:0});
  assert.deepEqual(marginAllocation(2,0,{community:3333,tenant:3333,duranki:3334}).allocations,{community:1,tenant:0,duranki:1});
  for(let amount=0;amount<1000;amount++)assert.equal(Object.values(marginAllocation(amount,0,shares).allocations).reduce((a,b)=>a+b,0),amount);
});
test('only configured free access activates; paid and stale plans cannot bypass collection',()=>{
  assert.equal(configuredSubscriptionPlan({},'catch-a-ride','free').error,409);
  const state={servicePricing:{deliveries:{mode:'paid',amountCents:3500}}};
  assert.equal(configuredSubscriptionPlan(state,'catch-a-ride','configured-monthly').error,503);
  assert.equal(configuredSubscriptionPlan(state,'catch-a-ride','free').error,400);
  state.servicePricing.deliveries={mode:'free',amountCents:0};
  assert.equal(configuredSubscriptionPlan(state,'catch-a-ride','configured-free').amountCents,0);
});
test('pricing API persists, audits, validates amounts, protects edits and rejects stale revisions',async t=>{
  let state={users:[{id:'admin',status:'active',roles:['Platform Admin']},{id:'member',status:'active',roles:['Member']}],serviceSubscriptions:[{amountCents:700}]};
  const app=express();app.use(express.json());app.use('/pricing',createServicePricingRouter({requireAuth:(req,res,next)=>{if(!req.get('x-user'))return res.sendStatus(401);req.auth={sub:req.get('x-user')};next();},resolveUser:async id=>({id,status:'active',roles:[id==='admin'?'Platform Admin':'Member']}),readState:()=>state,updateState:fn=>{const copy=structuredClone(state);fn(copy);state=copy;}}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{server.closeAllConnections();server.close();});
  const call=(user,path='',body)=>fetch('http://127.0.0.1:'+server.address().port+'/pricing'+path,{method:body?'PUT':'GET',headers:{'x-user':user,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  assert.equal((await call('')).status,401);
  const body={mode:'paid',amountCents:3550,costCents:2000,shares:{community:2500,tenant:2500,duranki:5000},revision:0};
  assert.equal((await call('member','/deliveries',body)).status,403);
  for(const amountCents of [-1,0,1.5,100000001])assert.equal((await call('admin','/deliveries',{...body,amountCents})).status,400);
  for(const costCents of [-1,1.5,100000001,null])assert.equal((await call('admin','/deliveries',{...body,costCents})).status,400);
  for(const shares of [null,{}, {community:2500,tenant:2500,duranki:4999},{community:-1,tenant:1,duranki:10000},{community:0.5,tenant:9999.5,duranki:0}])assert.equal((await call('admin','/deliveries',{...body,shares})).status,400);
  assert.equal((await call('admin','/missing',body)).status,404);
  assert.equal((await call('admin','/deliveries',body)).status,200);
  assert.equal((await call('admin','/deliveries',body)).status,409);
  const data=await (await call('member')).json();assert.equal(data.canEdit,false);assert.equal(data.services.find(s=>s.code==='deliveries').amountCents,3550);
  for(const row of data.services){assert.equal('costCents' in row,false);assert.equal('shares' in row,false);assert.equal('updatedBy' in row,false);}
  const admin=await (await call('admin')).json();assert.equal(admin.services.find(s=>s.code==='deliveries').costCents,2000);
  assert.deepEqual(admin.services.find(s=>s.code==='deliveries').shares,body.shares);
  assert.equal((await call('admin','/deliveries',{...body,mode:'free',amountCents:0,revision:1})).status,200);
  assert.equal(state.servicePricing.deliveries.amountCents,0);assert.equal(state.servicePricingAudit.length,2);
  assert.equal(state.serviceSubscriptions[0].amountCents,700);
});

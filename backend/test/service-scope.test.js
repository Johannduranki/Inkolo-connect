import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServicePricingRouter } from '../src/service-pricing.js';
import { serviceScope, memberServiceScope, storeServiceSetting, effectiveServicePrice, serviceEnabled } from '../src/service-scope.js';
import { MysqlCycleBilling } from '../src/mysql-cycle-billing.js';

export function fixture() {
  return {
    users:[{id:'admin',status:'active',roles:['Platform Admin']},{id:'staff',status:'active',roles:['Tenant Staff']},{id:'member',status:'active',roles:['Member']}],
    tenantAccessDirectory:[{id:'tenant-a',name:'Tenant A'},{id:'tenant-b',name:'Tenant B'}],
    tenantStaff:[{userId:'staff',tenantId:'tenant-a',status:'active',permissions:['services.manage']}],
    importedCommunities:[{id:'legacy-a',platformCommunityId:'community-a',name:'Community A',tenantId:'tenant-a',tenantName:'Tenant A'},{id:'community-b',name:'Community B',tenantId:'tenant-a',tenantName:'Tenant A'},{id:'community-c',name:'Community C',tenantId:'tenant-b',tenantName:'Tenant B'}],
    memberCommunities:[{memberId:'member',communityId:'legacy-a',tenantId:'tenant-a',isPrimary:true}],
    serviceSubscriptions:[{amountCents:700}],
    servicePricing:{deliveries:{mode:'paid',amountCents:3000,costCents:1000,shares:{community:2500,tenant:2500,duranki:5000},revision:1}},
    cycleServiceAvailability:{tenants:['tenant-a','tenant-b'].map(id=>({id,status:'active',serviceCodes:['deliveries']})),communities:[['community-a','tenant-a'],['community-b','tenant-a'],['community-c','tenant-b']].map(([id,tenantId])=>({id,tenantId,status:'active',serviceCodes:['deliveries']}))}
  };
}
const price=amountCents=>({mode:'paid',amountCents,costCents:500,shares:{community:2500,tenant:2500,duranki:5000}});
test('independent tenant/community prices, inheritance and unchanged agreements',()=>{
  const s=fixture(),a=serviceScope(s,{communityId:'legacy-a'}),b=serviceScope(s,{communityId:'community-b'}),c=serviceScope(s,{communityId:'community-c'});
  storeServiceSetting(s,'staff','deliveries',{tenantId:'tenant-a'},{revision:0},price(2500));
  assert.equal(effectiveServicePrice(s,'deliveries',a).amountCents,2500);
  assert.equal(effectiveServicePrice(s,'deliveries',c).amountCents,3000);
  const own=storeServiceSetting(s,'staff','deliveries',a,{revision:0},price(2000));
  assert.equal(effectiveServicePrice(s,'deliveries',a).amountCents,2000);
  assert.equal(effectiveServicePrice(s,'deliveries',b).amountCents,2500);
  assert.throws(()=>storeServiceSetting(s,'staff','deliveries',a,{revision:0},price(1500)),{status:409});
  storeServiceSetting(s,'staff','deliveries',a,{revision:own.revision,inheritPrice:true},null);
  assert.equal(effectiveServicePrice(s,'deliveries',a).amountCents,2500);
  assert.equal(effectiveServicePrice(s,'deliveries',a).source,'tenant');
  assert.deepEqual(s.serviceSubscriptions,[{amountCents:700}]);
  assert.equal(s.servicePricing.deliveries.amountCents,3000);
});
test('platform-first setup, canonical community selection and fresh tenant permissions',()=>{
  const s=fixture();
  assert.equal(memberServiceScope(s,'member').communityId,'community-a');
  assert.throws(()=>memberServiceScope(s,'member','community-c'),{status:403});
  assert.throws(()=>serviceScope(s,{tenantId:'tenant-b',communityId:'legacy-a'}),{status:403});
  assert.throws(()=>storeServiceSetting(s,'staff','wallet',{tenantId:'tenant-a'},{revision:0},price(2000)),{status:409});
  assert.throws(()=>storeServiceSetting(s,'staff','deliveries',{tenantId:'tenant-b'},{revision:0},price(2000)),{status:403});
  s.tenantStaff[0].status='revoked';
  assert.throws(()=>storeServiceSetting(s,'staff','deliveries',{tenantId:'tenant-a'},{revision:0},price(2000)),{status:403});
});
test('availability is independent by community and cannot bypass parent disablement',()=>{
  const s=fixture(),a=serviceScope(s,{communityId:'legacy-a'}).community,b=serviceScope(s,{communityId:'community-b'}).community;
  storeServiceSetting(s,'staff','deliveries',{communityId:a.id},{revision:0,inheritPrice:true,enabled:false},null);
  assert.equal(serviceEnabled(s,a,'deliveries'),false);assert.equal(serviceEnabled(s,b,'deliveries'),true);
  storeServiceSetting(s,'staff','deliveries',{tenantId:'tenant-a'},{revision:0,inheritPrice:true,enabled:false},null);
  assert.equal(serviceEnabled(s,b,'deliveries'),false);
  storeServiceSetting(s,'staff','deliveries',{communityId:b.id},{revision:0,inheritPrice:true,enabled:true},null);
  assert.equal(serviceEnabled(s,b,'deliveries'),false);
  s.servicePricing.deliveries.enabled=false;
  assert.equal(serviceEnabled(s,serviceScope(s,{communityId:'community-c'}).community,'deliveries'),false);
});
test('MariaDB billing resolves the scoped price and revision',()=>{
  const s=fixture();storeServiceSetting(s,'staff','deliveries',{communityId:'community-a'},{revision:0},price(2000));
  for(const Prototype of [MysqlCycleBilling.prototype]){
    const billing=Object.create(Prototype);billing.readState=()=>s;
    assert.equal(billing.price('deliveries',{tenant_id:'tenant-a',community_id:'community-a'}).amountCents,2000);
    assert.equal(billing.price('deliveries',{tenantId:'tenant-b',id:'community-c'}).amountCents,3000);
    assert.equal(billing.price('deliveries',{tenantId:'tenant-a',id:'community-a'}).revision,2);
  }
});
test('HTTP scoped reads, writes, redaction and cross-tenant access',async t=>{
  const state=fixture(),app=express();app.use(express.json());app.use('/pricing',createServicePricingRouter({requireAuth:(req,res,next)=>{req.auth={sub:req.get('x-user')};next();},resolveUser:async id=>state.users.find(u=>u.id===id),readState:()=>state,updateState:fn=>fn(state)}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.closeAllConnections();server.close();});
  const call=(user,path,body)=>fetch(`http://127.0.0.1:${server.address().port}/pricing${path}`,{method:body?'PUT':'GET',headers:{'x-user':user,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  const scopes=await(await call('staff','/scopes')).json();assert.equal(scopes.platform,false);assert.deepEqual(scopes.tenants.map(t=>t.id),['tenant-a']);assert.equal(scopes.communities.length,2);
  const body={...price(1800),revision:0};
  assert.equal((await call('staff','/deliveries?communityId=community-c',body)).status,403);
  assert.equal((await call('member','/deliveries?communityId=legacy-a',body)).status,403);
  assert.equal((await call('staff','/deliveries?communityId=legacy-a',body)).status,200);
  const data=await(await call('member','?member=true')).json(),row=data.services.find(s=>s.code==='deliveries');assert.equal(row.amountCents,1800);assert.equal(row.priceSource,'community');assert(!('costCents' in row));assert(!('shares' in row));
  assert.equal((await call('member','?member=true&communityId=community-c')).status,403);
  assert.equal((await call('staff','/deliveries?tenantId=tenant-b',body)).status,403);
});

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
test('Duranki prices replace scoped overrides while historical agreements remain untouched',()=>{
 const s=fixture();s.tenantServicePricing={'tenant-a':{deliveries:price(2500)}};s.communityServicePricing={'community-a':{deliveries:price(2000)}};
 const before=structuredClone(s);
 assert.equal(effectiveServicePrice(s,'deliveries',serviceScope(s,{communityId:'legacy-a'})).amountCents,3000);
 assert.deepEqual(s,before);
 assert.throws(()=>storeServiceSetting(s,'staff','deliveries',{tenantId:'tenant-a'},{revision:0},price(1000)),{status:403});
 const saved=storeServiceSetting(s,'admin','deliveries',{}, {revision:1},price(3500));
 assert.equal(saved.amountCents,3500);assert.deepEqual(s.serviceSubscriptions,before.serviceSubscriptions);
 assert.deepEqual(s.communityServicePricing,before.communityServicePricing);
});
test('community membership boundaries still apply',()=>{
 const s=fixture();assert.equal(memberServiceScope(s,'member').communityId,'community-a');
 assert.throws(()=>memberServiceScope(s,'member','community-c'),{status:403});
 assert.throws(()=>serviceScope(s,{tenantId:'tenant-b',communityId:'legacy-a'}),{status:403});
});
test('availability follows Duranki across active communities',()=>{
 const s=fixture(),a=serviceScope(s,{communityId:'legacy-a'}).community;
 s.cycleServiceAvailability.communities[0].serviceCodes=[];
 assert.equal(serviceEnabled(s,a,'deliveries'),true);
 s.servicePricing.deliveries.enabled=false;assert.equal(serviceEnabled(s,a,'deliveries'),false);
});
test('MariaDB billing uses the Duranki price and revision',()=>{
 const s=fixture();s.communityServicePricing={'community-a':{...price(2000),revision:7}};
 const billing=Object.create(MysqlCycleBilling.prototype);billing.readState=()=>s;
 assert.equal(billing.price('deliveries',{tenant_id:'tenant-a',community_id:'community-a'}).amountCents,3000);
 assert.equal(billing.price('deliveries',{tenantId:'tenant-a',id:'community-a'}).revision,1);
});

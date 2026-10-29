import test from 'node:test';
import assert from 'node:assert/strict';
import {memberCapabilities,reconcileMemberCatalogue,scopedMemberCatalogue,programmeContext} from '../../frontend/public/member-service-catalogue.js';
import {resolveCommunityConfiguration} from '../../frontend/public/tenant-service-policy.js';
import {serviceCatalogue,configuredSubscriptionPlan} from '../src/service-pricing.js';
const rows=Object.entries(serviceCatalogue).map(([code,name])=>({code,name,mode:'unconfigured'}));
test('every admin service has exactly one member card and explicit readiness',()=>{
  assert.deepEqual(Object.keys(memberCapabilities).sort(),Object.keys(serviceCatalogue).sort());
  const cards=reconcileMemberCatalogue([],rows);assert.equal(cards.length,rows.length);
  assert.equal(new Set(cards.map(c=>c.canonicalCode)).size,rows.length);
  assert.ok(cards.every(c=>c.catalogueStatus&&c.description&&typeof c.image==='string'&&c.catalogueBlocked));
});
test('all enabled standard services appear while disabled tenant or community services do not',()=>{
  const cards=reconcileMemberCatalogue([],rows),codes=rows.map(r=>r.code);
  const config=resolveCommunityConfiguration({churchId:'c'},[{id:'c',tenantId:'t',serviceCodes:codes}],[{id:'t',serviceCodes:codes}]);
  assert.equal(scopedMemberCatalogue(cards,config).length,codes.length);
  const partial=resolveCommunityConfiguration({churchId:'c'},[{id:'c',tenantId:'t',serviceCodes:codes}],[{id:'t',serviceCodes:['jobs','loans']}]);
  assert.deepEqual(scopedMemberCatalogue(cards,partial).map(c=>c.canonicalCode),['jobs','loans']);
  assert.deepEqual(scopedMemberCatalogue(cards,null),[]);
});
test('grouped service names do not silently enable other products or create duplicate aliases',()=>{
  const cards=reconcileMemberCatalogue([],rows);
  assert.deepEqual(scopedMemberCatalogue(cards,{serviceCodes:['airtime','utilities','internet']}).map(c=>c.canonicalCode),['airtime','utilities','internet']);
  assert.equal(scopedMemberCatalogue(cards,{serviceCodes:['marketplace','build-up-balance']}).length,1);
});
test('custom enabled services remain visible but cannot subscribe',()=>{
  const cards=scopedMemberCatalogue([],{serviceCodes:['custom-service']});
  assert.equal(cards.length,1);assert.equal(cards[0].catalogueStatus,'Not yet implemented');assert.equal(cards[0].catalogueBlocked,true);
});
test('readiness separates free, unconfigured, paid and unfinished services without mock prices',()=>{
  const build=(code,mode)=>reconcileMemberCatalogue([{code,plans:[{price:'R999'}]}],[{code,name:code,mode,amountCents:2500}])[0];
  assert.equal(build('jobs','free').catalogueStatus,'Available');
  assert.equal(build('jobs','unconfigured').catalogueStatus,'Pricing required');
  assert.equal(build('jobs','unconfigured').plans.length,0);
  assert.equal(build('jobs','paid').catalogueStatus,'Payment setup required');
  assert.equal(build('vas-services','free').catalogueStatus,'Provider connection required');
  assert.equal(build('loans','free').catalogueStatus,'Not yet implemented');
});
test('pricing failure never makes a service available',()=>{
  assert.ok(reconcileMemberCatalogue([],rows,false).every(c=>c.catalogueBlocked));
});
test('training readiness checks published programme in the selected community',()=>{
  const data={communities:[{id:'canonical',aliases:['legacy']}],programmes:[{communityId:'canonical',state:'PUBLISHED'}]};
  const training=[{code:'trader-training',name:'Training',mode:'free'}];
  assert.equal(reconcileMemberCatalogue([],training,true,programmeContext(data,'legacy'))[0].catalogueStatus,'Available');
  assert.equal(reconcileMemberCatalogue([],training,true,programmeContext(data,'other'))[0].catalogueStatus,'Programme setup required');
  assert.equal(reconcileMemberCatalogue([],training,true,programmeContext(null,'legacy'))[0].catalogueStatus,'Programme status unavailable');
});
test('direct subscription requests cannot activate unfinished provider services',()=>{
  for(const code of ['vas-services','loans','insurance','pos'])assert.equal(configuredSubscriptionPlan({servicePricing:{[code]:{mode:'free',amountCents:0}}},code,'configured-free').error,503);
});

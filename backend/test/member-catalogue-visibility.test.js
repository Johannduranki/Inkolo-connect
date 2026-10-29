import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileMemberCatalogue,scopedMemberCatalogue} from '../../frontend/public/member-service-catalogue.js';
const rows = [
  {code:'marketplace',mode:'free'},
  {code:'jobs',mode:'paid',amountCents:500,checkoutReady:true},
  {code:'deliveries',mode:'paid',amountCents:500,checkoutReady:false},
  {code:'trader-training',mode:'unconfigured'},
  {code:'wallet',mode:'free'},
  {code:'business-services',mode:'free'},
  {code:'funeral-cover',mode:'unconfigured'}
];
const scope = {serviceCodes:[...rows.map(r=>r.code),'unknown-service']};
test('member cards hide missing configuration and provider workflows without deleting catalogue rows',()=>{
  const cards=reconcileMemberCatalogue([],rows);
  assert.equal(cards.length,rows.length);
  assert.deepEqual(scopedMemberCatalogue(cards,scope,true).map(c=>c.canonicalCode),['marketplace','jobs']);
  assert.equal(scopedMemberCatalogue(cards,scope).length,rows.length+1);
  assert.deepEqual(scopedMemberCatalogue(reconcileMemberCatalogue([],rows,false),scope,true),[]);
});
test('funeral needs enabled plans and training needs a published programme',()=>{
  const cards=reconcileMemberCatalogue([],rows,true,{funeralReady:true});
  assert.ok(scopedMemberCatalogue(cards,scope,true).some(c=>c.code==='funeral'));
  const training=[{code:'trader-training',mode:'free'}];
  assert.equal(scopedMemberCatalogue(reconcileMemberCatalogue([],training,true,{trainingLoaded:true,programmeReady:false}),scope,true).length,0);
  assert.equal(scopedMemberCatalogue(reconcileMemberCatalogue([],training,true,{trainingLoaded:true,programmeReady:true}),scope,true).length,1);
  assert.equal(scopedMemberCatalogue(cards,{serviceCodes:[]},true).length,0);
});

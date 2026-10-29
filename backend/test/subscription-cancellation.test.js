import test from 'node:test';
import assert from 'node:assert/strict';
import {cancelStoredSubscription} from '../src/subscription-cancellation.js';

test('cancellation affects only the authenticated member, service and community',()=>{
  const state={serviceSubscriptions:[
    {userId:1,serviceCode:'training',communityId:'a',status:'active'},
    {userId:1,serviceCode:'training',communityId:'b',status:'active'},
    {userId:2,serviceCode:'training',communityId:'a',status:'active'},
    {userId:1,serviceCode:'wallet',communityId:'a',status:'active'}
  ],memberDocuments:[{id:'retained'}],legalAcceptances:[{id:'retained'}]};
  cancelStoredSubscription(state,'1','training','a','2026-10-29');
  assert.deepEqual(state.serviceSubscriptions.map(s=>s.status),['cancelled','active','active','active']);
  cancelStoredSubscription(state,'1','training','a','2026-10-30');
  assert.equal(state.serviceSubscriptions[0].cancelledAt,'2026-10-29');
  assert.equal(state.memberDocuments.length,1);assert.equal(state.legalAcceptances.length,1);
});
test('missing or foreign subscription cannot be cancelled',()=>{
  const state={serviceSubscriptions:[{userId:2,serviceCode:'wallet',status:'active'}]};
  assert.throws(()=>cancelStoredSubscription(state,1,'wallet',''),{status:404});
  assert.equal(state.serviceSubscriptions[0].status,'active');
});

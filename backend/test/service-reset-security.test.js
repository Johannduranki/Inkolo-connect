import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeServiceReset,resetUserServiceData,removableMemberDocumentPaths} from '../src/user-reset.js';
import path from 'node:path';

const fixture=()=>({users:[{id:'owner',status:'active',roles:['Member']},{id:'other',status:'active',roles:['Member']},{id:'admin',status:'active',roles:['Platform Admin']},{id:'legacy',status:'active',roles:['Admin User']}],
  serviceSubscriptions:[{id:'one',userId:'owner'},{id:'two',userId:'other'}],legalAcceptances:[{id:'one',userId:'owner'},{id:'two',userId:'other'}],memberDocuments:[]});

test('service resets require explicit active self or platform-admin authority',()=>{
  const state=fixture(),before=structuredClone(state);
  for(const [actorId,mode] of [[undefined,undefined],['other','self'],['owner','admin'],['legacy','admin'],['admin','anything']])assert.throws(()=>authorizeServiceReset(state,'owner',actorId,mode),{status:403});
  authorizeServiceReset(state,'owner','owner','self');authorizeServiceReset(state,'owner','admin','admin');
  assert.deepEqual(state,before);state.users[0].status='inactive';assert.throws(()=>authorizeServiceReset(state,'owner','owner','self'),{status:403});
});

test('denied reset never enters SQL or the platform mutation',async()=>{
  const state=fixture(),before=structuredClone(state);let calls=0;
  await assert.rejects(resetUserServiceData('owner',true,{actorId:'other',mode:'self',readState:()=>state,updateState:()=>{calls++;},sqlPool:{getConnection:()=>{calls++;}}}),{status:403});
  assert.equal(calls,0);assert.deepEqual(state,before);
});

for(const mode of ['admin','self'])test(`queued ${mode} reset rejects revoked access before changing any records`,async()=>{
  const state=fixture(),actorId=mode==='admin'?'admin':'owner';
  const options={actorId,mode,readState:()=>state,updateState:fn=>{const actor=state.users.find(u=>u.id===actorId);if(mode==='admin')actor.roles=['Member'];else actor.status='inactive';return fn(state);}};
  await assert.rejects(resetUserServiceData('owner',false,options),{status:403});
  assert.equal(state.serviceSubscriptions.length,2);assert.equal(state.legalAcceptances.length,2);assert.equal(state.securityAudit,undefined);
});

test('authorized isolated reset changes only its target and records non-sensitive audit metadata',async()=>{
  let state=fixture();
  const summary=await resetUserServiceData('owner',false,{actorId:'admin',mode:'admin',readState:()=>state,updateState:fn=>{const draft=structuredClone(state),result=fn(draft);state=draft;return result;}});
  assert.equal(summary.subscriptionsDeleted,1);assert.equal(summary.agreementsDeleted,1);
  assert.deepEqual(state.serviceSubscriptions,[{id:'two',userId:'other'}]);assert.deepEqual(state.legalAcceptances,[{id:'two',userId:'other'}]);
  assert.equal(state.users.length,4);assert.equal(state.securityAudit[0].action,'user.services.reset');assert.equal(state.securityAudit[0].actorId,'admin');
});

test('SQL reset rolls back if authority changes while waiting for a connection',async()=>{
  const state=fixture();let deletes=0,rollbacks=0,commits=0,releases=0;
  const connection={beginTransaction:async()=>{state.users[2].roles=['Member'];},execute:async()=>{deletes++;return [{}];},rollback:async()=>{rollbacks++;},commit:async()=>{commits++;},release:()=>{releases++;}};
  await assert.rejects(resetUserServiceData('owner',true,{actorId:'admin',mode:'admin',readState:()=>state,updateState:()=>{throw Error('Must not mutate');},sqlPool:{getConnection:async()=>connection}}),{status:403});
  assert.equal(deletes,0);assert.equal(rollbacks,1);assert.equal(commits,0);assert.equal(releases,1);assert.equal(state.serviceSubscriptions.length,2);
});

test('document cleanup preserves files still referenced by another record and stays inside the upload directory',()=>{
  const removed=[{fileUrl:'/uploads/member-documents/shared.pdf'},{fileUrl:'/uploads/member-documents/only-this-member.pdf'},{fileUrl:'..'}];
  const paths=removableMemberDocumentPaths(removed,[{fileUrl:'/uploads/member-documents/shared.pdf'}]);
  assert.deepEqual(paths,[path.resolve('uploads/member-documents/only-this-member.pdf')]);
});

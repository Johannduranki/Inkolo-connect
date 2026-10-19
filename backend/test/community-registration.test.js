import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {registerCommunityMember,joinableCommunities,createCommunityRegistrationRouter} from '../src/community-registration.js';
const fixture = () => ({users:[{id:1,status:'active',roles:['Platform Admin']},{id:2,status:'active',roles:['Member']}],
  importedCommunities:[{id:'trader-ilembe',platformCommunityId:'community-traders',name:'Traders KZN',tenantId:'tenant-trader',tenantName:'Trader Connect'},
    {id:'zuc',name:'ZUC Community',tenantId:'tenant-zuc',tenantName:'ZUC'}],memberCommunities:[],subscriptions:[],wallets:[]});
test('admin joins without losing roles, duplicating identity or recording payment',()=>{
  const state=fixture();const result=registerCommunityMember(state,1,'community-traders');
  assert.deepEqual(result.roles,['Platform Admin','Member']);assert.equal(state.users.length,2);
  assert.equal(result.membership.tenantId,'tenant-trader');assert.equal(result.membership.churchId,'trader-ilembe');
  assert.equal(state.subscriptions.length,0);assert.equal(state.wallets.length,0);assert.equal(state.communityRegistrationAudit.length,1);
});
test('multiple memberships are additive, repeat and alias joins are idempotent',()=>{
  const state=fixture();registerCommunityMember(state,1,'community-traders');
  assert.equal(registerCommunityMember(state,1,'trader-ilembe').alreadyMember,true);
  registerCommunityMember(state,1,'zuc');assert.equal(state.memberCommunities.length,2);
  assert.equal(state.memberCommunities.filter(m=>m.isPrimary).length,1);assert.equal(state.communityRegistrationAudit.length,2);
});
test('unavailable accounts and communities cannot register',()=>{
  const state=fixture();state.users[0].status='inactive';
  assert.throws(()=>registerCommunityMember(state,1,'zuc'),{status:403});
  assert.throws(()=>registerCommunityMember(state,2,'invented'),{status:400});
  state.importedCommunities[0].status='inactive';assert.equal(joinableCommunities(state).length,1);
  assert.throws(()=>registerCommunityMember(state,2,'trader-ilembe'),{status:400});
});
test('ordinary members cannot acquire admin permissions by joining',()=>{
  const state=fixture();registerCommunityMember(state,2,'zuc');assert.deepEqual(state.users[1].roles,['Member']);
});
test('API requires authentication and ignores supplied identity, tenant and roles',async t=>{
  const state=fixture(),app=express();app.use(express.json());
  app.use('/join',createCommunityRegistrationRouter({requireAuth:(req,res,next)=>{if(!req.get('x-test-user'))return res.sendStatus(401);req.auth={sub:req.get('x-test-user')};next();},
    resolveUser:async id=>state.users.find(u=>String(u.id)===id),readState:()=>state,updateState:fn=>fn(state),databaseAvailable:false}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.closeAllConnections();server.close();});
  const url='http://127.0.0.1:'+server.address().port+'/join';
  assert.equal((await fetch(url)).status,401);
  const response=await fetch(url,{method:'POST',headers:{'x-test-user':'2','Content-Type':'application/json'},body:JSON.stringify({communityId:'zuc',userId:'1',tenantId:'tenant-trader',roles:['Platform Admin']})});
  assert.equal(response.status,201);const result=await response.json();assert.equal(result.membership.memberId,'2');assert.equal(result.membership.tenantId,'tenant-zuc');assert.deepEqual(result.roles,['Member']);
  const choices=await(await fetch(url,{headers:{'x-test-user':'1'}})).json();assert.ok(choices.communities.every(c=>!c.joined));
});

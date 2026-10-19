import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createPlatformRouter} from '../src/platform-api.js';
import {communityPeerIds,requireCommunityPeer} from '../src/community-messaging-security.js';

function fixture(){return {
  users:['alice','bob','carol','dave','disabled','spoof'].map(id=>({id,firstName:id,lastName:'Member',status:id==='disabled'?'inactive':'active',roles:['Member'],telephoneNumber:'0712345678'})),
  importedCommunities:[{id:'legacy-a',platformCommunityId:'community-a',name:'A',tenantId:'tenant-a',tenantName:'A'},{id:'legacy-b',platformCommunityId:'community-b',name:'B',tenantId:'tenant-b',tenantName:'B'},{id:'legacy-c',platformCommunityId:'community-c',name:'C',tenantId:'tenant-a',tenantName:'A'}],
  memberCommunities:[{memberId:'alice',communityId:'legacy-a',tenantId:'tenant-a'},{memberId:'bob',communityId:'community-a',tenantId:'tenant-a'},{memberId:'carol',communityId:'legacy-b',tenantId:'tenant-b'},{memberId:'dave',communityId:'legacy-c',tenantId:'tenant-a'},{memberId:'disabled',communityId:'legacy-a',tenantId:'tenant-a'},{memberId:'spoof',communityId:'legacy-a',tenantId:'tenant-b'}],
  contacts:[{ownerUserId:'alice',contactUserId:'carol'}],directMessages:[]
};}
test('community peers use canonical membership, tenant scope and active accounts',()=>{
  const state=fixture();assert.deepEqual([...communityPeerIds(state,'alice')],['bob']);
  assert.deepEqual([...communityPeerIds(state,'alice','legacy-a')],['bob']);
  for(const peer of ['carol','dave','disabled','spoof','alice'])assert.throws(()=>requireCommunityPeer(state,'alice',peer),{status:404});
  assert.throws(()=>communityPeerIds(state,'alice','community-b'),{status:403});
  assert.throws(()=>communityPeerIds(state,'alice',[]),{status:400});
  state.memberCommunities.push({memberId:'alice',communityId:'legacy-b',tenantId:'tenant-b'});
  assert.deepEqual([...communityPeerIds(state,'alice')],['bob','carol']);
  assert.deepEqual([...communityPeerIds(state,'alice','community-b')],['carol']);
  state.users[0].roles=['Platform Admin'];assert.throws(()=>requireCommunityPeer(state,'alice','dave'),{status:404});
});
test('community API denies foreign recipients and rechecks membership at commit',async t=>{
  let state=fixture(),beforeWrite=()=>{};
  const app=express();app.use(express.json());app.use('/platform',createPlatformRouter({requireAuth:(req,res,next)=>{if(!req.get('x-user'))return res.sendStatus(401);req.auth={sub:req.get('x-user')};next();},readPlatformState:()=>state,updatePlatformState:async fn=>{await beforeWrite();const draft=structuredClone(state),result=fn(draft);state=draft;return result;}}));
  app.use((error,req,res,next)=>res.status(error.status||500).json({message:'Request rejected'}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{server.closeAllConnections();server.close();});
  const call=(path,body,user='alice')=>fetch(`http://127.0.0.1:${server.address().port}/platform/community${path}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-user':user},body:body?JSON.stringify(body):undefined});
  assert.equal((await call('/members?query=bob',null,'')).status,401);
  assert.deepEqual((await(await call('/members?query=bob')).json()).map(u=>u.id),['bob']);
  assert.deepEqual(await(await call('/members?query=nobody')).json(),[]);
  assert.equal((await call('/members?query=bob&communityId=community-b')).status,403);
  assert.deepEqual(await(await call('/contacts')).json(),[]);
  for(const peer of ['carol','dave','disabled','spoof']){
    assert.equal((await call('/contacts',{contactUserId:peer})).status,404);
    assert.equal((await call('/conversations/'+peer,{text:'test'})).status,404);
    assert.equal((await call('/conversations/'+peer)).status,404);
  }
  assert.equal((await call('/contacts',{contactUserId:'bob'})).status,201);
  assert.equal((await call('/conversations/bob',{text:'test',senderUserId:'carol'})).status,201);
  state.directMessages.push({conversationId:'alice:bob',senderUserId:'carol',recipientUserId:'dave',text:'must remain private',sentAt:'2026-01-01'});
  const messages=await(await call('/conversations/bob')).json();assert.equal(messages.length,1);assert.equal(messages[0].senderUserId,'alice');
  beforeWrite=()=>{state.memberCommunities=state.memberCommunities.filter(m=>m.memberId!=='bob');};
  assert.equal((await call('/conversations/bob',{text:'revoked'})).status,404);
  assert.equal(state.directMessages.length,2);assert.equal(state.contacts.length,2);
  assert.equal((await call('/conversations/bob')).status,404);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createPlatformRouter} from '../src/platform-api.js';

for (const [route, listings, conversations, owner, buyer, terminal] of [
  ['marketplace', 'marketplaceListings', 'marketplaceConversations', 'sellerUserId', 'buyerUserId', ['SOLD', 'CANCELLED']],
  ['properties', 'propertyListings', 'propertyConversations', 'ownerUserId', 'interestedUserId', ['SOLD', 'RENTED', 'WITHDRAWN']]
]) {
  test(`${route} enquiries authorize current listing and participants inside the write queue`, async t => {
    let state, beforeWrite;
    const reset = () => {
      state = { users: ['alice', 'bob', 'other'].map(id => ({ id, status: 'active', roles: ['Member'] })),
        [listings]: [{ id: 'listing', [owner]: 'bob', status: 'AVAILABLE' }], [conversations]: [] };
      beforeWrite = () => {};
    };
    reset();
    const app = express(); app.use(express.json());
    app.use(createPlatformRouter({ requireAuth: (req, res, next) => { req.auth = { sub: 'alice' }; next(); },
      readPlatformState: () => state, updatePlatformState: async fn => {
        beforeWrite(); const draft = structuredClone(state), result = fn(draft); state = draft; return result;
      } }));
    app.use((error, req, res, next) => res.status(error.status || 500).json({ message: 'Rejected' }));
    const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    t.after(() => { server.closeAllConnections(); server.close(); });
    const call = () => fetch(`http://127.0.0.1:${server.address().port}/${route}/listings/listing/conversations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [owner]: 'other', [buyer]: 'other' })
    });
    assert.equal((await call()).status, 201);
    assert.equal((await call()).status, 201);
    assert.equal(state[conversations].length, 1);
    assert.equal(state[conversations][0][buyer], 'alice');
    assert.equal(state[conversations][0][owner], 'bob');
    for (const change of [
      () => { state[listings] = []; },
      ...terminal.map(status => () => { state[listings][0].status = status; }),
      () => { state.users[0].status = 'inactive'; },
      () => { state.users[1].status = 'inactive'; },
      () => { state.users.splice(1, 1); }
    ]) {
      reset(); beforeWrite = change;
      assert.equal((await call()).status, 404);
      assert.equal(state[conversations].length, 0);
    }
    reset(); beforeWrite = () => { state[listings][0][owner] = 'alice'; };
    assert.equal((await call()).status, 400);
    assert.equal(state[conversations].length, 0);
    reset(); beforeWrite = () => { state[listings][0][owner] = 'other'; };
    assert.equal((await call()).status, 201);
    assert.equal(state[conversations][0][owner], 'other');
  });
}

test('marketplace and property messages recheck participants and account status at commit',async t=>{
  let state,beforeWrite=()=>{};
  const reset=()=>{state={users:['alice','bob','outsider'].map(id=>({id,status:'active',roles:['Member']})),marketplaceConversations:[{id:'market',buyerUserId:'alice',sellerUserId:'bob',status:'ACTIVE'}],marketplaceMessages:[],propertyConversations:[{id:'property',interestedUserId:'alice',ownerUserId:'bob',status:'ACTIVE'}],propertyMessages:[]};beforeWrite=()=>{};};reset();
  const app=express();app.use(express.json());app.use('/platform',createPlatformRouter({requireAuth:(req,res,next)=>{req.auth={sub:req.get('x-user')};next();},readPlatformState:()=>state,updatePlatformState:async fn=>{await beforeWrite();const draft=structuredClone(state),result=fn(draft);state=draft;return result;}}));
  app.use((error,req,res,next)=>res.status(error.status||500).json({message:'Request rejected'}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.closeAllConnections();server.close();});
  for(const [route,id,collection,messages,field] of [['marketplace','market','marketplaceConversations','marketplaceMessages','buyerUserId'],['properties','property','propertyConversations','propertyMessages','interestedUserId']]){
    reset();const call=(user='alice')=>fetch(`http://127.0.0.1:${server.address().port}/platform/${route}/conversations/${id}/messages`,{method:'POST',headers:{'Content-Type':'application/json','x-user':user},body:JSON.stringify({messageText:'Synthetic message',senderUserId:'outsider'})});
    assert.equal((await call('outsider')).status,403);assert.equal(state[messages].length,0);
    assert.equal((await call()).status,201);assert.equal(state[messages][0].senderUserId,'alice');
    for(const change of [()=>{state[collection][0][field]='outsider';},()=>{state[collection][0].status='CLOSED';},()=>{state.users[0].status='inactive';},()=>{state.users[1].status='inactive';}]){
      reset();beforeWrite=change;assert.equal((await call()).status,404);assert.equal(state[messages].length,0);
    }
  }
});

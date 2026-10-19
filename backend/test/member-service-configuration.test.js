import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createPlatformRouter } from '../src/platform-api.js';

test('member configuration returns only the selected membership and tenant/community intersection', async t => {
  const state = {users:[{id:'member',status:'active',roles:['Member']}],
    memberCommunities:[{memberId:'member',churchId:'a'},{memberId:'other',churchId:'b'}],
    cycleServiceAvailability:{tenants:[{id:'t',status:'active',serviceCodes:['wallet','jobs']}],
      communities:[{id:'a',tenantId:'t',status:'active',serviceCodes:['wallet','loans']}]} };
  const before = structuredClone(state);
  const app=express();
  app.use(createPlatformRouter({requireAuth:(req,_res,next)=>{req.auth={sub:'member'};next();},
    readPlatformState:()=>state,updatePlatformState:()=>{throw Error('Read must not write.');}}));
  const server=app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>{server.closeAllConnections();server.close();});
  const base=`http://127.0.0.1:${server.address().port}/community/me`;
  const response=await fetch(base+'?communityId=a');
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).serviceConfiguration,{id:'a',tenantId:'t',serviceCodes:['wallet']});
  assert.equal((await fetch(base+'?communityId=b')).status,403);
  assert.deepEqual(state,before);
  state.cycleServiceAvailability.tenants[0].status='inactive';
  assert.deepEqual((await (await fetch(base+'?communityId=a')).json()).serviceConfiguration.serviceCodes,[]);
  delete state.cycleServiceAvailability;
  assert.equal((await (await fetch(base+'?communityId=a')).json()).serviceConfiguration,null);
});

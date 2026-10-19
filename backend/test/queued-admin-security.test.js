import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createPlatformRouter} from '../src/platform-api.js';
import {createCycleRouter} from '../src/cycle-api.js';

test('global roles and Cycle configuration cannot be changed after queued admin revocation',async t=>{
  let state,revocations=0;
  const reset=()=>{state={users:[{id:'admin',status:'active',roles:['Platform Admin']},{id:'member',status:'active',roles:['Member']},{id:'provider',status:'active',roles:['Service Provider User']}],importedCommunities:[{id:'community',tenantId:'tenant',name:'Synthetic'}]};};reset();
  const update=async fn=>{state.users[0].roles=['Member'];return fn(state);};
  const requireAuth=(req,res,next)=>{req.auth={sub:'admin'};next();};
  const app=express();app.locals.sessions={revokeUser:async()=>{revocations++;}};app.use(express.json());
  app.use('/platform',createPlatformRouter({requireAuth,readPlatformState:()=>state,updatePlatformState:update}));
  app.use('/cycle',createCycleRouter({requireAuth,readState:()=>state,resolveUser:async id=>state.users.find(u=>u.id===id),store:{},billing:{updateState:update}}));
  app.use((error,req,res,next)=>res.status(error.status||500).json({message:'Request rejected'}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.closeAllConnections();server.close();});
  const call=(path,body,method='PUT')=>fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await call('/platform/admin/users/member/roles',{roles:['Platform Admin']})).status,403);assert.deepEqual(state.users[1].roles,['Member']);assert.equal(revocations,0);assert.equal(state.securityAudit,undefined);
  reset();assert.equal((await call('/cycle/availability',{tenants:[],communities:[]})).status,403);assert.equal(state.cycleServiceAvailability,undefined);assert.equal(state.securityAudit,undefined);
  reset();assert.equal((await call('/platform/admin/provider-grants',{userId:'provider',serviceProviderId:'synthetic',tenantId:'tenant',communityId:'community',serviceCodes:['wallet'],status:'active'},'POST')).status,403);assert.equal(state.providerAccessGrants,undefined);
});

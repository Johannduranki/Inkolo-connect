import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { authenticatedRequestClass, createAuthenticatedAbuseProtection } from '../src/api-abuse-protection.js';

test('abuse protection classifies sensitive requests independently of query values', () => {
  for(const path of ['/api/platform/wallet/transfer','/api/cycle/billing','/api/treasury/payments/id/approve','/api/subscriptions'])assert.equal(authenticatedRequestClass({method:'POST',originalUrl:path+'?scope=other'}),'financial');
  assert.equal(authenticatedRequestClass({method:'PATCH',originalUrl:'/api/platform/profile'}),'write');
  assert.equal(authenticatedRequestClass({method:'GET',originalUrl:'/api/community-reports?communityId=c'}),'report');
  assert.equal(authenticatedRequestClass({method:'GET',originalUrl:'/api/platform/community/members?q=name'}),'search');
  for(const url of ['/api/presence','/api/platform/wallet','/api/cycle/config','/api/subscriptions'])assert.equal(authenticatedRequestClass({method:'GET',originalUrl:url}),null);
});
async function fixture(t,{duplicate=false}={}) {
  const app=express();
  // Synthetic trusted identity resolver, not a production authentication mechanism.
  app.use((req,_res,next)=>{if(req.get('x-test-user'))req.auth={sub:req.get('x-test-user')};next();});
  const guard=createAuthenticatedAbuseProtection({limits:{financial:2,write:2,report:2,search:2}});
  app.use(guard);if(duplicate)app.use(guard);
  app.use((_req,res)=>res.json({ok:true}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{server.closeAllConnections();server.close();});
  return (path,{user='one',method='POST',headers={}}={})=>fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{...headers,...(user?{'x-test-user':user}:{})}});
}
test('missing trusted identity is rejected without granting access from caller identifiers', async t => {
  const call=await fixture(t);assert.equal((await call('/api/platform/wallet/transfer',{user:null,headers:{'x-user-id':'admin','x-tenant-id':'other'}})).status,401);
});
test('financial limits are per authenticated user and cannot be bypassed by forwarded IP or query', async t => {
  const call=await fixture(t);for(let i=0;i<2;i++)assert.equal((await call('/api/platform/wallet/transfer')).status,200);
  const limited=await call('/api/platform/wallet/cash-out?user=other',{headers:{'x-forwarded-for':'192.0.2.1'}});assert.equal(limited.status,429);assert.ok(limited.headers.get('retry-after'));assert.equal(limited.headers.get('cache-control'),'no-store');
  assert.equal((await call('/api/platform/wallet/transfer',{user:'two'})).status,200);
});
test('read-only dashboard and presence requests remain usable after write throttling', async t => {
  const call=await fixture(t);for(let i=0;i<3;i++)await call('/api/platform/profile',{method:'PATCH'});
  for(let i=0;i<4;i++)assert.equal((await call('/api/presence',{method:'GET'})).status,200);
  assert.equal((await call('/api/presence/heartbeat')).status,200);
  assert.equal((await call('/api/auth/logout')).status,200);
  assert.equal((await call('/api/platform/wallet',{method:'GET'})).status,200);
});
test('reports and member searches have separate budgets', async t => {
  const call=await fixture(t);for(let i=0;i<2;i++)assert.equal((await call('/api/community-reports?communityId=c',{method:'GET'})).status,200);
  assert.equal((await call('/api/community-reports?communityId=other',{method:'GET'})).status,429);
  assert.equal((await call('/api/platform/community/members?q=one',{method:'GET'})).status,200);
});
test('nested guards charge the request only once', async t => {
  const call=await fixture(t,{duplicate:true});for(let i=0;i<2;i++)assert.equal((await call('/api/platform/profile',{method:'PATCH'})).status,200);
  assert.equal((await call('/api/platform/profile',{method:'PATCH'})).status,429);
});

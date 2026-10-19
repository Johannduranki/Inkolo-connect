import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync } from 'node:fs';
import { createTenantAccessRouter } from '../src/tenant-access.js';
import { createBrandingRouter } from '../src/branding.js';
import { verifyPassword } from '../src/password-security.js';

const png=readFileSync(new URL('../../frontend/public/inkolo-connect-logo.png',import.meta.url));
async function harness(t) {
  let state={users:[{id:'admin',status:'active',roles:['Platform Admin']}],profiles:[],importedCommunities:[{id:'community-a',name:'A',tenantId:'tenant-a',tenantName:'A'}]};
  let beforeWrite=()=>{};
  const options={requireAuth:(req,res,next)=>{req.auth={sub:'admin'};next();},resolveUser:async id=>state.users.find(u=>u.id===id),readState:()=>state,updateState:fn=>{
    beforeWrite(state);
    const copy=structuredClone(state),result=fn(copy);
    state=copy;return result;
  }};
  const app=express();app.use(express.json());
  app.use('/tenant',createTenantAccessRouter(options));app.use('/branding',createBrandingRouter(options));
  app.use((error,req,res,next)=>res.status(error.status||500).json({message:'Rejected'}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>{server.closeAllConnections();server.close();});
  const base=`http://127.0.0.1:${server.address().port}`;
  return {
    state:()=>state,before:fn=>{beforeWrite=fn;},
    post:(path,body)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),
    upload:()=>{const body=new FormData();body.append('logo',new Blob([png]),'logo.png');body.append('revision','0');return fetch(base+'/branding/community/community-a',{method:'PUT',body});}
  };
}

for(const path of ['/tenant','/branding/directory']) {
  test(`${path} rejects a queued request after admin access is revoked`,async t=>{
    const h=await harness(t);h.before(state=>{state.users[0].roles=['Member'];});
    assert.equal((await h.post(path,{kind:'tenant',id:'tenant-new',name:'New'})).status,403);
    assert.equal(h.state().tenantAccessDirectory,undefined);assert.equal(h.state().brandingDirectory,undefined);
    assert.equal(h.state().brandingAudit,undefined);
  });
  test(`${path} rechecks concurrent directory registration`,async t=>{
    const h=await harness(t);h.before(state=>{state.tenantAccessDirectory=[{id:'tenant-new',name:'Original'}];});
    const response=await h.post(path,{kind:'tenant',id:'tenant-new',name:'Overwrite'});
    assert.equal(response.status,200);assert.equal((await response.json()).name,'Original');
    assert.equal(h.state().tenantAccessDirectory.length,1);assert.equal(h.state().brandingAudit,undefined);
  });
}

test('logo writes reject revoked users and changed community scope without storing image data',async t=>{
  const h=await harness(t);h.before(state=>{state.users[0].status='inactive';});
  assert.equal((await h.upload()).status,403);
  h.before(state=>{state.importedCommunities[0].tenantId='tenant-other';});
  h.state().users[0].status='active';
  assert.equal((await h.upload()).status,409);
  assert.equal(h.state().brandingImages,undefined);assert.equal(h.state().entityBranding,undefined);assert.equal(h.state().brandingAudit,undefined);
});

test('community creation rechecks its parent inside the write queue',async t=>{
  const h=await harness(t);h.before(state=>{state.importedCommunities=[];});
  assert.equal((await h.post('/branding/directory',{kind:'community',id:'community-new',name:'New',tenantId:'tenant-a'})).status,400);
  assert.equal(h.state().brandingDirectory,undefined);
});

const staff={telephoneNumber:'0711111111',firstName:'Test',lastName:'Staff',email:'staff@example.test',password:'  test-only-passphrase  ',permissions:['tenant.view']};
test('staff API applies the shared password policy, ignores injected hashes and preserves existing credentials',async t=>{
  const h=await harness(t);
  assert.equal((await h.post('/tenant/tenant-a/staff',{...staff,password:'too-short',passwordHash:'attacker-hash'})).status,400);
  assert.equal(h.state().users.length,1);
  const response=await h.post('/tenant/tenant-a/staff',staff);assert.equal(response.status,200);
  const hash=h.state().users[1].passwordHash;assert.match(hash,/^scrypt-v1:/);
  assert(await verifyPassword(staff.password,hash));assert.equal(await verifyPassword(staff.password.trim(),hash),false);
  assert.doesNotMatch(await response.text(),/password|scrypt-v1/);
  await h.post('/tenant',{id:'tenant-b',name:'B'});
  assert.equal((await h.post('/tenant/tenant-b/staff',{...staff,password:'ignored'})).status,200);
  assert.equal(h.state().users.length,2);assert.equal(h.state().users[1].passwordHash,hash);
});

test('new staff creation fails if admin access is revoked before the queued save',async t=>{
  const h=await harness(t);h.before(state=>{state.users[0].roles=['Member'];});
  assert.equal((await h.post('/tenant/tenant-a/staff',staff)).status,403);
  assert.equal(h.state().users.length,1);assert.equal(h.state().profiles.length,0);assert.equal(h.state().tenantStaff,undefined);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createTenantAccessRouter, saveTenantStaff, permissionsFor } from '../src/tenant-access.js';
import { hashPassword, verifyPassword } from '../src/password-security.js';
import { needsMfa } from '../src/mfa.js';
const owner={id:1,firstName:'Owner',lastName:'Admin',status:'active',roles:['Platform Admin']};
const fixture=()=>({users:[structuredClone(owner)],profiles:[],importedCommunities:[{id:'ca',tenantId:'tenant-a',tenantName:'A',name:'Community A'},{id:'cb',tenantId:'tenant-b',tenantName:'B',name:'Community B'}]});
const body={telephoneNumber:'0711111111',firstName:'Test',lastName:'Staff',email:'staff@example.test',password:'Long-passphrase-123',permissions:['tenant.view','users.manage','communities.view']};
const preparedHash=await hashPassword(body.password);
test('new staff can sign in with hashed password, require MFA, and receive only tenant permissions',async()=>{
  const state=fixture();const result=saveTenantStaff(state,owner,'tenant-a',body,undefined,preparedHash);
  const user=state.users.find(u=>String(u.id)===result.userId);
  assert(await verifyPassword(body.password,user.passwordHash));assert(needsMfa(user));
  assert(!user.roles.includes('Platform Admin'));assert(!JSON.stringify(result).includes(user.passwordHash));
  assert.deepEqual(permissionsFor(state,user,'tenant-b'),[]);
  assert.equal(state.tenantAccessAudit.length,1);
});
test('staff can delegate only own permissions; foreign tenant and foreign assignment fail closed',()=>{
  const state=fixture();const row=saveTenantStaff(state,owner,'tenant-a',{...body,permissions:['tenant.view','users.manage']},undefined,preparedHash);
  const actor=state.users[1];
  assert.throws(()=>saveTenantStaff(state,actor,'tenant-b',body),{status:403});
  assert.throws(()=>saveTenantStaff(state,actor,'tenant-a',body),{status:400});
  assert.throws(()=>saveTenantStaff(state,owner,'tenant-b',{permissions:['tenant.view']},row.id),{status:404});
  assert.throws(()=>saveTenantStaff(state,owner,'tenant-a',{...body,permissions:['Platform Admin']}),{status:400});
});
test('existing account password is preserved, assignments are unique, revocation is immediate',()=>{
  const state=fixture();const row=saveTenantStaff(state,owner,'tenant-a',body,undefined,preparedHash);const hash=state.users[1].passwordHash;
  saveTenantStaff(state,owner,'tenant-b',{...body,password:'ignored'});
  assert.equal(state.users.length,2);assert.equal(state.users[1].passwordHash,hash);
  assert.throws(()=>saveTenantStaff(state,owner,'tenant-a',body),{status:409});
  saveTenantStaff(state,owner,'tenant-a',{permissions:['tenant.view'],status:'revoked'},row.id);
  assert.deepEqual(permissionsFor(state,state.users[1],'tenant-a'),[]);
  assert(permissionsFor(state,state.users[1],'tenant-b').length>0);
});
test('HTTP requests enforce per-tenant grants and redact credentials',async()=>{
  const state=fixture();saveTenantStaff(state,owner,'tenant-a',body,undefined,preparedHash);
  const app=express();app.use(express.json());app.use('/api/tenant-access',createTenantAccessRouter({requireAuth:(req,res,next)=>{if(!req.get('x-user'))return res.sendStatus(401);req.auth={sub:req.get('x-user')};next();},readState:()=>state,updateState:fn=>fn(state)}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}/api/tenant-access`;
  try{
    assert.equal((await fetch(base)).status,401);
    const headers={'x-user':'2','Content-Type':'application/json'};
    const list=await(await fetch(base,{headers})).json();assert.deepEqual(list.map(t=>t.id),['tenant-a']);
    assert.equal((await fetch(base+'/tenant-b/staff',{headers})).status,403);
    assert.equal((await fetch(base,{method:'POST',headers,body:JSON.stringify({id:'tenant-c',name:'C'})})).status,403);
    const staff=await(await fetch(base+'/tenant-a/staff',{headers})).json();assert(!JSON.stringify(staff).includes('passwordHash'));
    const communities=await(await fetch(base+'/tenant-a/communities',{headers})).json();assert.deepEqual(communities.map(c=>c.id),['ca']);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

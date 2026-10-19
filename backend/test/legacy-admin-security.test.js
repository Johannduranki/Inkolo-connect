import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { createPlatformRouter } from '../src/platform-api.js';
import { profileVersion } from '../src/admin-profile.js';

async function harness(t) {
  let state={users:[{id:1,status:'active',roles:['Platform Admin']},{id:2,status:'active',roles:['Member','KZNCC User'],firstName:'Test',lastName:'Member',telephoneNumber:'0711111111',email:''}],profiles:[{userId:2}],contacts:[],churches:[{id:'church-a',branding:{logoUrl:'/existing.png'}}]};
  let beforeWrite=()=>{};
  const revoked=[];
  const uploads=[];
  const app=express();app.locals.sessions={revokeUser:async id=>revoked.push(String(id))};app.use(express.json());
  app.use((req,res,next)=>{res.on('finish',()=>{if(req.file?.path)uploads.push(req.file.path);});next();});
  app.use('/platform',createPlatformRouter({requireAuth:(req,res,next)=>{req.auth={sub:'1'};next();},readPlatformState:()=>state,updatePlatformState:fn=>{
    beforeWrite(state);const copy=structuredClone(state),result=fn(copy);state=copy;return result;
  }}));
  app.use((error,req,res,next)=>res.status(error.status||500).json({message:'Request rejected'}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>{
    server.closeAllConnections();server.close();
    for(const file of uploads) {
      const resolved=path.resolve(file);
      assert.equal(path.dirname(resolved),path.resolve('uploads/community-logos'));
      assert.match(path.basename(resolved),/^[a-f0-9-]{36}\.png$/);
      if(existsSync(resolved))unlinkSync(resolved);
    }
  });
  const base=`http://127.0.0.1:${server.address().port}/platform`;
  return {state:()=>state,revoked,before:fn=>{beforeWrite=fn;},
    upload:()=>{const body=new FormData();body.append('logo',new Blob([readFileSync(new URL('../../frontend/public/inkolo-connect-logo.png',import.meta.url))],{type:'image/png'}),'synthetic-logo.png');return fetch(base+'/admin/churches/church-a/logo',{method:'POST',body});},
    call:(method,path,body)=>fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)})};
}
const newUser={firstName:'Synthetic',lastName:'Only',telephoneNumber:'0722222222',roles:['Member'],role:'KZNCC User'};
const branding={logoUrl:'/existing.png',primaryColor:'#123456',secondaryColor:'#123456',accentColor:'#123456',backgroundColor:'#123456'};

for(const [method,path,body] of [
  ['POST','/admin/users',newUser],['POST','/kzncc-admin/users',newUser],
  ['DELETE','/admin/users/2'],['DELETE','/kzncc-admin/users/2'],
  ['DELETE','/admin/users/2/service-data'],
  ['PUT','/admin/users/2/profile',{}],['PUT','/admin/churches/church-a/branding',branding]
]) {
  test(`${method} ${path} rejects an administrator revoked while waiting to save`,async t=>{
    const h=await harness(t),before=structuredClone(h.state());h.before(state=>{state.users[0].roles=['Member'];});
    assert.equal((await h.call(method,path,body)).status,403);
    const expected=structuredClone(before);expected.users[0].roles=['Member'];
    assert.deepEqual(h.state(),expected);assert.deepEqual(h.revoked,[]);
  });
}

test('authorized account creation and removal remain available, audited and session-revoking',async t=>{
  const h=await harness(t),response=await h.call('POST','/admin/users',newUser);
  assert.equal(response.status,201);assert.deepEqual((await response.json()).roles,['Member']);
  assert.equal(h.state().securityAudit[0].action,'user.created');
  assert.equal((await h.call('DELETE','/admin/users/2')).status,204);
  assert.deepEqual(h.revoked,['2']);assert.equal(h.state().securityAudit[1].action,'user.removed');
  assert.equal(h.state().users.some(u=>u.id===2),false);
});

test('KZNCC removal rechecks target classification inside the mutation',async t=>{
  const h=await harness(t);h.before(state=>{state.users[1].roles=['Member'];});
  assert.equal((await h.call('DELETE','/kzncc-admin/users/2')).status,404);
  assert.equal(h.state().users.length,2);assert.deepEqual(h.revoked,[]);
});

test('authorized profile and branding changes still succeed with audits',async t=>{
  const h=await harness(t),user=h.state().users[1],profile=h.state().profiles[0];
  const body={version:profileVersion(user,profile),firstName:'Updated',lastName:'Member',telephoneNumber:'0711111111',email:'',address:'',city:'',postalCode:'',emergencyContactName:'',emergencyContactNumber:''};
  assert.equal((await h.call('PUT','/admin/users/2/profile',body)).status,200);
  assert.equal(h.state().profileAudit[0].actorId,'1');
  assert.equal((await h.call('PUT','/admin/churches/church-a/branding',branding)).status,200);
  assert.equal(h.state().securityAudit[0].action,'community.branding.changed');
});

test('legacy logo uploads reject revoked admins and retain authorized upload behaviour',async t=>{
  const h=await harness(t);h.before(state=>{state.users[0].roles=['Member'];});
  assert.equal((await h.upload()).status,403);
  assert.equal(h.state().churches[0].branding.logoUrl,'/existing.png');assert.equal(h.state().securityAudit,undefined);
  h.state().users[0].roles=['Platform Admin'];h.before(()=>{});
  const response=await h.upload();assert.equal(response.status,201);
  assert.match((await response.json()).branding.logoUrl,/^\/uploads\/community-logos\/[a-f0-9-]{36}\.png$/);
  assert.equal(h.state().securityAudit[0].action,'community.logo.changed');
});

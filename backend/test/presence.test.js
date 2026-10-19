import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { PresenceStore, createPresenceRouter } from '../src/presence.js';

test('presence counts unique users, expires inactivity and ignores inactive accounts',()=>{
  let now=1000; const store=new PresenceStore({now:()=>now}); const ids=new Set(['1','2']);
  assert.equal(store.count(ids),0);
  store.touch('tab-a','1',1000);store.touch('tab-b','1',1000);store.touch('inactive','3',1000);
  assert.equal(store.count(ids),1);
  store.remove('tab-a');assert.equal(store.count(ids),1);
  now+=90000;assert.equal(store.count(ids),0);
});
test('token expiration and explicit logout remove presence',()=>{
  let now=1000;const store=new PresenceStore({now:()=>now});const ids=new Set(['1']);
  store.touch('session','1',2);now=2000;assert.equal(store.count(ids),0);
  store.touch('session','1',100);store.remove('session');assert.equal(store.count(ids),0);
});
test('presence API requires authentication and reserves totals for platform admin',async t=>{
  const app=express();const users=[{id:'1',status:'active',roles:['Platform Admin']},{id:'2',status:'active',roles:['Member']}];
  app.use(createPresenceRouter({requireAuth:(req,res,next)=>{const id=req.get('authorization')?.replace('Bearer ','');if(!users.some(u=>u.id===id))return res.sendStatus(401);req.auth={sub:id,exp:Math.floor(Date.now()/1000)+60};next();},resolveUser:async id=>users.find(u=>u.id===id),listUsers:async()=>users}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base+'/heartbeat',{method:'POST'})).status,401);
  assert.equal((await fetch(base+'/summary',{headers:{Authorization:'Bearer 2'}})).status,403);
  await fetch(base+'/heartbeat',{method:'POST',headers:{Authorization:'Bearer 1'}});
  const response=await fetch(base+'/summary',{headers:{Authorization:'Bearer 1'}});const result=await response.json();
  assert.equal(result.onlineUsers,1);assert.equal(result.totalUsers,2);assert.equal(result.windowSeconds,90);
  await fetch(base+'/session',{method:'DELETE',headers:{Authorization:'Bearer 1'}});
  assert.equal((await (await fetch(base+'/summary',{headers:{Authorization:'Bearer 1'}})).json()).onlineUsers,0);
});

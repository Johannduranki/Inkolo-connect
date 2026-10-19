import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {registrationPhone,createRegistrationCheckRouter} from '../src/registration-check.js';
test('normalizes complete local and international numbers, rejects invalid input',()=>{
  assert.equal(registrationPhone('060 123 4567'),'0601234567');
  assert.equal(registrationPhone('+27 (60) 123-4567'),'0601234567');
  for(const value of [null,123,{},'060123','0601234567bad','x'.repeat(40)])assert.equal(registrationPhone(value),'');
});
test('public lookup has no role or membership disclosure and is rate limited',async t=>{
  const app=express();app.use(express.json());let calls=0;
  app.use('/check',createRegistrationCheckRouter({exists:async phone=>{calls++;return phone==='0601234567';}}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.closeAllConnections();server.close();});
  const check=telephoneNumber=>fetch('http://127.0.0.1:'+server.address().port+'/check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({telephoneNumber})});
  const found=await check('+27601234567');assert.equal(found.headers.get('cache-control'),'no-store');assert.deepEqual(await found.json(),{registered:true});
  assert.deepEqual(await(await check('0601234568')).json(),{registered:false});
  assert.equal((await check('bad')).status,400);assert.equal(calls,2);
  for(let i=0;i<17;i++)await check('0601234567');
  assert.equal((await check('0601234567')).status,429);
});

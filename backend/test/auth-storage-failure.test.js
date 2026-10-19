import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccessToken,requireAuth} from '../src/auth.js';

test('no access token is returned before its durable session registration succeeds',async()=>{
  await assert.rejects(createAccessToken({id:'synthetic'}, {}, {register:async()=>{throw Error('storage failure');}}),/storage failure/);
});

test('SQL session outage fails closed with 503, not a misleading invalid-token response',async()=>{
  const token=await createAccessToken({id:'synthetic'});
  const req={get:()=>`Bearer ${token}`,app:{locals:{sessions:{allowed:async()=>{throw Error('SQL secrets must not escape');}}}}};
  const res={status:()=>{throw Error('Unexpected invalid-token response');}};
  let forwarded;
  await requireAuth(req,res,error=>{assert.ok(error,'must not authorize the request');forwarded=error;});
  assert.equal(forwarded.status,503);
  assert.equal(forwarded.code,'AUTH_STORAGE_UNAVAILABLE');
  assert.doesNotMatch(forwarded.message,/secrets/);
});

test('MFA storage outage fails closed after an otherwise valid durable session',async()=>{
  const token=await createAccessToken({id:'synthetic'});
  const req={get:()=>`Bearer ${token}`,app:{locals:{sessions:{allowed:async()=>true},mfa:{resolveUser:async()=>({status:'active'}),store:{allowed:async()=>{throw Error('SQL query');}}}}}};
  const res={status:()=>{throw Error('Unexpected invalid-token response');}};
  let forwarded;
  await requireAuth(req,res,error=>{assert.ok(error);forwarded=error;});
  assert.equal(forwarded.status,503);
});

test('invalid tokens are rejected before touching session storage',async()=>{
  let status,body;
  const req={get:()=> 'Bearer not-a-token',app:{locals:{sessions:{allowed:()=>{throw Error('Must not read storage');}}}}};
  const res={status(value){status=value;return this;},json(value){body=value;return this;}};
  await requireAuth(req,res,()=>assert.fail('Must not authorize'));
  assert.equal(status,401);
  assert.match(body.message,/invalid or has expired/);
});

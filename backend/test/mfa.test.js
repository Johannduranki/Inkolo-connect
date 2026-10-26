import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { authenticator } from '@otplib/v12-adapter';
import { MfaStore, needsMfa } from '../src/mfa.js';
import { authSqlDouble } from './helpers/auth-sql-double.js';

const admin={id:'admin',roles:['Member','Platform Admin']};
function store(){return new MfaStore(authSqlDouble(),null,randomBytes(32));}
test('normal members are exempt and all privileged roles require MFA',()=>{
  assert.equal(needsMfa({roles:['Member','COMMUNITY_MEMBER']}),false);
  for(const role of ['Platform Admin','TENANT_ADMIN','Tenant Admin','Accountant','Treasury Operator','Service Provider Admin','Pastor','Bishop'])assert.equal(needsMfa({roles:['Member',role]}),true);
});
test('enrolment encrypts secret, verifies authenticator and prevents replay',async()=>{
  const s=store(),id=await s.begin('admin',{treasury:'admin'}),setup=await s.setup(id);
  assert.match(setup.uri,/otpauth:\/\/totp\//);
  assert.notEqual((await s.challenge(id)).pending_secret,setup.secret);
  const code=authenticator.generate(setup.secret),result=await s.verify(id,code);
  assert.equal(result.recoveryCodes.length,8);
  assert.equal(result.claims.treasury,'admin');
  assert.ok(await s.allowed(admin,{mfa:result.version,mfaAt:Date.now()}));
  assert.equal(await s.allowed(admin,{}),false);
  await assert.rejects(()=>s.verify(id,code));
  await assert.rejects(async()=>s.verify(await s.begin('admin'),code));
  await assert.rejects(async()=>s.setup(await s.begin('admin')));
});
test('recovery codes work once and are hashed in storage',async()=>{
  const s=store(),id=await s.begin('admin'),setup=await s.setup(id),result=await s.verify(id,authenticator.generate(setup.secret));
  const code=result.recoveryCodes[0];assert.ok(!(await s.credential('admin')).recovery.includes(code));
  await s.verify(await s.begin('admin'),code);
  await assert.rejects(async()=>s.verify(await s.begin('admin'),code));
});
test('challenge expires, is replaced and rejects repeated failures',async()=>{
  const s=store(),first=await s.begin('admin'),second=await s.begin('admin');await assert.rejects(()=>s.setup(first));
  await s.setup(second);for(let i=0;i<5;i++)await assert.rejects(()=>s.verify(second,'invalid'));
  await assert.rejects(()=>s.challenge(second));
  const expired=await s.begin('admin');s.pool.challenges.get(expired).expires=0;await assert.rejects(()=>s.setup(expired));
});

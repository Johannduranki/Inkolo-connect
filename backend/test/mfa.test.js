import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { authenticator } from '@otplib/v12-adapter';
import { MfaStore, needsMfa } from '../src/mfa.js';

const admin={id:'admin',roles:['Member','Platform Admin']};
function store(t){const s=new MfaStore(':memory:',null,randomBytes(32));t.after(()=>s.db.close());return s;}
test('normal members are exempt and all privileged roles require MFA',()=>{
  assert.equal(needsMfa({roles:['Member','COMMUNITY_MEMBER']}),false);
  for(const role of ['Platform Admin','TENANT_ADMIN','Tenant Admin','Accountant','Treasury Operator','Service Provider Admin','Pastor','Bishop'])assert.equal(needsMfa({roles:['Member',role]}),true);
});
test('enrolment encrypts secret, verifies authenticator and prevents replay',t=>{
  const s=store(t),id=s.begin('admin',{treasury:'admin'}),setup=s.setup(id);
  assert.match(setup.uri,/otpauth:\/\/totp\//);
  assert.notEqual(s.get('SELECT pending_secret FROM challenge WHERE id=?',id).pending_secret,setup.secret);
  const code=authenticator.generate(setup.secret),result=s.verify(id,code);
  assert.equal(result.recoveryCodes.length,8);
  assert.equal(result.claims.treasury,'admin');
  assert.ok(s.allowed(admin,{mfa:result.version,mfaAt:Date.now()}));
  assert.equal(s.allowed(admin,{}),false);
  assert.throws(()=>s.verify(id,code));
  assert.throws(()=>s.verify(s.begin('admin'),code));
  assert.throws(()=>s.setup(s.begin('admin')));
});
test('recovery codes work once and are hashed in storage',t=>{
  const s=store(t),id=s.begin('admin'),setup=s.setup(id),result=s.verify(id,authenticator.generate(setup.secret));
  const code=result.recoveryCodes[0];assert.ok(!s.credential('admin').recovery.includes(code));
  s.verify(s.begin('admin'),code);
  assert.throws(()=>s.verify(s.begin('admin'),code));
});
test('challenge expires, is replaced and rejects repeated failures',t=>{
  const s=store(t),first=s.begin('admin'),second=s.begin('admin');assert.throws(()=>s.setup(first));
  s.setup(second);for(let i=0;i<5;i++)assert.throws(()=>s.verify(second,'invalid'));
  assert.throws(()=>s.challenge(second));
  const expired=s.begin('admin');s.run('UPDATE challenge SET expires=0 WHERE id=?',expired);assert.throws(()=>s.setup(expired));
});

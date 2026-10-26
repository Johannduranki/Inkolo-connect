import test from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import {randomUUID} from 'node:crypto';
import {authenticator} from '@otplib/v12-adapter';
import {MysqlMfaStore,MysqlSessionStore} from '../src/mysql-auth-store.js';
import {integrationEnvironment} from './http-harness.js';

async function fixture(t){
  const env=integrationEnvironment();
  const options={host:env.DB_HOST,port:Number(env.DB_PORT),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME,connectionLimit:4,connectTimeout:5000};
  let pool=mysql.createPool(options);
  const userId=`sql-adapter-test-${randomUUID()}`;
  t.after(async()=>{
    try{for(const table of ['duranki_mfa_credential','duranki_mfa_challenge','duranki_mfa_audit','duranki_auth_session','duranki_auth_identity'])await pool.execute(`DELETE FROM ${table} WHERE user_id=?`,[userId]);}
    finally{await pool.end();}
  });
  const [[row]]=await pool.query('SELECT VERSION() AS version');
  assert.match(row.version,/MariaDB/i);
  const key=Buffer.from(env.MFA_ENCRYPTION_KEY,'base64');
  await new MysqlMfaStore(pool,null,key).ready();
  return {pool,userId,key,async reconnect(){await pool.end();pool=mysql.createPool(options);return pool;}};
}
test('MariaDB sessions enforce ownership, idle expiry and durable revocation',{timeout:30000},async t=>{
  const {pool,userId}=await fixture(t);let now=Date.now();
  const store=new MysqlSessionStore(pool,()=>now),other=new MysqlSessionStore(pool,()=>now);
  const claims={jti:randomUUID(),sub:userId,exp:Math.floor(now/1000)+3600};
  await store.register(claims);
  assert.equal(await other.allowed(claims),true);
  assert.equal(await store.allowed({...claims,sub:'other'}),false);
  now+=30*60*1000+1;
  assert.equal(await store.allowed(claims),false);
  const fresh={...claims,jti:randomUUID(),exp:Math.floor(now/1000)+3600};
  await store.register(fresh);await store.revoke(fresh.jti);
  assert.equal(await other.allowed(fresh),false);
  const latest={...fresh,jti:randomUUID()};await store.register(latest);
  await other.revokeUser(userId);assert.equal(await store.allowed(latest),false);
});
test('MariaDB MFA enrolment and recovery codes are single-use under concurrent verification',{timeout:30000},async t=>{
  const {pool,userId,key}=await fixture(t);
  const store=new MysqlMfaStore(pool,null,key),other=new MysqlMfaStore(pool,null,key);
  const id=await store.begin(userId,{test:true});
  const setup=await store.setup(id);
  const code=authenticator.generate(setup.secret);
  const results=await Promise.allSettled([store.verify(id,code),other.verify(id,code)]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  const enrolled=results.find(result=>result.status==='fulfilled').value;
  assert.equal(enrolled.recoveryCodes.length,8);
  const next=await store.begin(userId);
  await assert.rejects(store.verify(next,code));
  const recovery=await Promise.allSettled([store.verify(next,enrolled.recoveryCodes[0]),other.verify(next,enrolled.recoveryCodes[0])]);
  assert.equal(recovery.filter(result=>result.status==='fulfilled').length,1);
  const retry=await store.begin(userId);
  await assert.rejects(store.verify(retry,enrolled.recoveryCodes[0]));
  assert.equal(await store.allowed({id:userId,roles:['Platform Admin']},{mfa:enrolled.version,mfaAt:Date.now()}),true);
  assert.equal(await store.allowed({id:userId,roles:['Platform Admin']},{mfa:'wrong',mfaAt:Date.now()}),false);
});
test('MariaDB MFA commits failed-attempt counters and blocks after five failures',{timeout:30000},async t=>{
  const {pool,userId,key}=await fixture(t),store=new MysqlMfaStore(pool,null,key);
  const id=await store.begin(userId);await store.setup(id);
  for(let attempt=0;attempt<5;attempt++)await assert.rejects(store.verify(id,'invalid'));
  await assert.rejects(store.challenge(id));
  const [rows]=await pool.execute('SELECT attempts FROM duranki_mfa_challenge WHERE id=?',[id]);
  assert.equal(rows[0].attempts,5);
});

test('MariaDB reconnect preserves sessions, encrypted MFA, challenge expiry and consumed recovery codes',{timeout:30000},async t=>{
  const fixtureState=await fixture(t),{userId,key}=fixtureState;
  let pool=fixtureState.pool;
  let now=Date.now();
  let sessions=new MysqlSessionStore(pool,()=>now),mfa=new MysqlMfaStore(pool,null,key);
  const claims={jti:randomUUID(),sub:userId,exp:Math.floor(now/1000)+7200};
  await sessions.register(claims);
  const replaced=await mfa.begin(userId),id=await mfa.begin(userId,{treasury:'admin'});
  await assert.rejects(()=>mfa.setup(replaced));
  const setup=await mfa.setup(id);
  assert.match(setup.uri,/otpauth:\/\/totp\//);
  assert.notEqual((await mfa.challenge(id)).pending_secret,setup.secret);
  const enrolled=await mfa.verify(id,authenticator.generate(setup.secret));
  assert.equal(enrolled.claims.treasury,'admin');
  const credential=await mfa.credential(userId);
  assert.notEqual(credential.secret,setup.secret);
  assert.equal(credential.recovery.includes(enrolled.recoveryCodes[0]),false);

  pool=await fixtureState.reconnect();
  sessions=new MysqlSessionStore(pool,()=>now);mfa=new MysqlMfaStore(pool,null,key);
  await mfa.ready();
  assert.equal(await sessions.allowed(claims,false),true);
  now+=29*60000;
  assert.equal(await sessions.allowed(claims,false),true);
  now+=2*60000;
  assert.equal(await sessions.allowed(claims,false),false);
  const fresh={...claims,jti:randomUUID()};await sessions.register(fresh);
  await sessions.revoke(fresh.jti);
  assert.equal(await mfa.allowed({id:userId,roles:['Platform Admin']},{mfa:enrolled.version,mfaAt:Date.now()}),true);
  await assert.rejects(()=>mfa.setup(id));
  const recovery=await mfa.begin(userId);
  await assert.rejects(()=>mfa.setup(recovery));
  await mfa.verify(recovery,enrolled.recoveryCodes[0]);
  const expired=await mfa.begin(userId);
  await pool.execute('UPDATE duranki_mfa_challenge SET expires=0 WHERE id=? AND user_id=?',[expired,userId]);

  pool=await fixtureState.reconnect();
  sessions=new MysqlSessionStore(pool,()=>now);mfa=new MysqlMfaStore(pool,null,key);
  assert.equal(await sessions.allowed(fresh,false),false);
  await assert.rejects(()=>mfa.challenge(expired));
  await assert.rejects(()=>mfa.verify(expired,enrolled.recoveryCodes[1]));
  const next=await mfa.begin(userId);
  await assert.rejects(()=>mfa.verify(next,enrolled.recoveryCodes[0]));
  await mfa.verify(next,enrolled.recoveryCodes[1]);
});

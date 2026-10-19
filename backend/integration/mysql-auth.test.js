import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import {randomBytes,randomUUID} from 'node:crypto';
import {authenticator} from '@otplib/v12-adapter';
import {MysqlMfaStore,MysqlSessionStore} from '../src/mysql-auth-store.js';

async function fixture(t){
  const pool=mysql.createPool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectionLimit:4});
  const userId=`sql-adapter-test-${randomUUID()}`;
  t.after(async()=>{
    try{for(const table of ['duranki_mfa_credential','duranki_mfa_challenge','duranki_mfa_audit','duranki_auth_session','duranki_auth_identity'])await pool.execute(`DELETE FROM ${table} WHERE user_id=?`,[userId]);}
    finally{await pool.end();}
  });
  return {pool,userId};
}
test('MariaDB sessions enforce ownership, idle expiry and durable revocation',async t=>{
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
test('MariaDB MFA enrolment and recovery codes are single-use under concurrent verification',async t=>{
  const {pool,userId}=await fixture(t),key=randomBytes(32);
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
test('MariaDB MFA commits failed-attempt counters and blocks after five failures',async t=>{
  const {pool,userId}=await fixture(t),store=new MysqlMfaStore(pool,null,randomBytes(32));
  const id=await store.begin(userId);await store.setup(id);
  for(let attempt=0;attempt<5;attempt++)await assert.rejects(store.verify(id,'invalid'));
  await assert.rejects(store.challenge(id));
  const [rows]=await pool.execute('SELECT attempts FROM duranki_mfa_challenge WHERE id=?',[id]);
  assert.equal(rows[0].attempts,5);
});

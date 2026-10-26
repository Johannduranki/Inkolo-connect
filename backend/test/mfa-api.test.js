import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import express from 'express';
import dotenv from 'dotenv';
import { authenticator } from '@otplib/v12-adapter';
import { MfaStore } from '../src/mfa.js';
import { authSqlDouble } from './helpers/auth-sql-double.js';
import { signToken } from '../src/token-security.js';
import { SessionStore } from '../src/session-security.js';

// Unit HTTP tests inject SQL; never load local application configuration files.
dotenv.config = () => ({ parsed: {} });
Object.assign(process.env, { NODE_ENV: 'test', ALLOW_DEMO_AUTH: 'false', FORCE_DEMO_MODE: 'false' });
for (const name of ['PLATFORM_STORAGE','AUTH_STORAGE','TREASURY_STORAGE','TRAINING_STORAGE','CYCLE_STORAGE','HERITAGE_STORAGE']) process.env[name]='mariadb';
const { createMfaRouter } = await import('../src/mfa-api.js');
const { requireAuth,createAccessToken } = await import('../src/auth.js');

async function listen(t, app) {
  const server=app.listen(0,'127.0.0.1');
  t.after(async()=>{
    server.closeAllConnections();
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  });
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  return `http://127.0.0.1:${server.address().port}`;
}

test('MFA API enforces challenge-only enrolment and blocks unverified API sessions',{timeout:15000},async t=>{
  for(const key of ['DB_HOST','DB_USER','DB_NAME','ID_PEPPER'])process.env[key]='test';
  process.env.JWT_SECRET=randomBytes(32).toString('hex');
  const store=new MfaStore(authSqlDouble(),null,randomBytes(32));
  const sessions=new SessionStore(authSqlDouble());
  const admin={id:'admin',first_name:'Test',last_name:'Admin',roles:['Platform Admin'],status:'active'};
  const member={...admin,id:'member',roles:['Member']};
  const resolveUser=id=>id==='admin'?admin:member;
  const app=express();app.use(express.json());app.locals.mfa={store,resolveUser};
  app.locals.sessions=sessions;
  app.use('/mfa',createMfaRouter({store,resolveUser,sessions}));
  app.get('/private',requireAuth,(req,res)=>res.json({ok:true}));
  const url=await listen(t,app);
  const call=(path,token,body)=>fetch(url+path,{signal:AbortSignal.timeout(5000),method:body?'POST':'GET',headers:{authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  const old=await createAccessToken(admin,{},sessions);
  assert.equal((await call('/private',old)).status,403);
  assert.equal((await call('/mfa/setup',old,{})).status,403);
  assert.equal((await call('/private',await createAccessToken(member,{},sessions))).status,200);
  const jti=await store.begin('admin'),challenge=signToken({sub:'admin',purpose:'mfa',jti},process.env.JWT_SECRET,'10m');
  assert.equal((await call('/private',challenge)).status,403);
  const setupResponse=await call('/mfa/setup',challenge,{});assert.equal(setupResponse.status,200);
  const setup=await setupResponse.json();assert.match(setup.qr,/^data:image\/png/);
  const verifyResponse=await call('/mfa/verify',challenge,{code:authenticator.generate(setup.secret)});assert.equal(verifyResponse.status,200);
  const verification=await verifyResponse.json();
  assert.equal(verification.recoveryCodes.length,8);
  assert.equal((await call('/private',verification.accessToken)).status,200);
  assert.equal((await call('/mfa/verify',challenge,{code:'000000'})).status,401);
  member.roles.push('Tenant Admin');
  assert.equal((await call('/private',await createAccessToken(member,{},sessions))).status,403);
});

test('MFA status respects revocation and idle expiry without extending a session',{timeout:15000},async t=>{
  for(const key of ['DB_HOST','DB_USER','DB_NAME','ID_PEPPER'])process.env[key]='test';
  process.env.JWT_SECRET=randomBytes(32).toString('hex');
  let now=Date.now();
  const sessions=new SessionStore(authSqlDouble(),()=>now),store=new MfaStore(authSqlDouble(),null,randomBytes(32));
  const member={id:'member',roles:['Member'],status:'active'},admin={id:'admin',roles:['Platform Admin'],status:'active'};
  const app=express();app.use('/mfa',createMfaRouter({store,sessions,resolveUser:id=>id==='member'?member:admin}));
  const url=await listen(t,app);
  const status=token=>fetch(url+'/mfa/status',{signal:AbortSignal.timeout(5000),headers:{Authorization:'Bearer '+token}});
  const token=await createAccessToken(member,{},sessions);
  assert.equal((await status(token)).status,200);
  now+=29*60000;assert.equal((await status(token)).status,200);
  now+=2*60000;assert.equal((await status(token)).status,401);
  const next=await createAccessToken(member,{},sessions);await sessions.revokeUser(member.id);
  assert.equal((await status(next)).status,401);
  const id=await store.begin(admin.id),challenge=signToken({sub:admin.id,purpose:'mfa',jti:id},process.env.JWT_SECRET,'10m');
  assert.equal((await status(challenge)).status,200);
  store.pool.challenges.get(id).expires=0;
  assert.equal((await status(challenge)).status,401);
  const other=await store.begin(admin.id),mismatch=signToken({sub:member.id,purpose:'mfa',jti:other},process.env.JWT_SECRET,'10m');
  assert.equal((await status(mismatch)).status,401);
});

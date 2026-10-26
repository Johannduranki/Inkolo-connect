import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import express from 'express';
import { MfaStore } from '../src/mfa.js';
import { SessionStore } from '../src/session-security.js';
import { TreasuryStore } from '../src/treasury-store.js';
import { CycleStore } from '../src/cycle-pay.js';
import { HeritageStore } from '../src/heritage-store.js';
import { TrainingStore, createTrainingRouter, draftModules, validateModules, trainingMemberView } from '../src/trader-training.js';
import { MysqlMfaStore, MysqlSessionStore } from '../src/mysql-auth-store.js';
import { MysqlTreasuryStore } from '../src/mysql-treasury-store.js';
import { MysqlCycleStore } from '../src/mysql-cycle-store.js';
import { MysqlHeritageStore } from '../src/mysql-heritage-store.js';
import { MysqlTrainingStore } from '../src/mysql-training-store.js';
import { MysqlCycleBilling } from '../src/mysql-cycle-billing.js';
import { createCycleRouter } from '../src/cycle-api.js';
import { createTreasuryRouter } from '../src/treasury-api.js';
import { createHeritageRouter } from '../src/heritage-api.js';
import { createMysqlHeritageRouter } from '../src/mysql-heritage-api.js';
import { authSqlDouble } from './helpers/auth-sql-double.js';

test('compatibility exports resolve exclusively to asynchronous MariaDB adapters',()=>{
  for(const [alias,sql] of [[MfaStore,MysqlMfaStore],[SessionStore,MysqlSessionStore],[TreasuryStore,MysqlTreasuryStore],[CycleStore,MysqlCycleStore],[HeritageStore,MysqlHeritageStore],[TrainingStore,MysqlTrainingStore],[createHeritageRouter,createMysqlHeritageRouter]])assert.equal(alias,sql);
  for(const factory of [createCycleRouter,createTreasuryRouter,createHeritageRouter,createTrainingRouter])assert.throws(()=>factory({}),/MariaDB/);
});

test('MFA default key is strict canonical base64, with no keyfile fallback',()=>{
  const original=process.env.MFA_ENCRYPTION_KEY;
  try{
    const encoded=Buffer.alloc(32,17).toString('base64');
    for(const value of ['', 'a'.repeat(64),encoded.trimEnd()+'\n',encoded.slice(0,-1),Buffer.alloc(31).toString('base64'),encoded.slice(0,-2)+'F=']){
      process.env.MFA_ENCRYPTION_KEY=value;
      assert.throws(()=>new MysqlMfaStore({},'unused-file'),/MFA_ENCRYPTION_KEY/);
    }
    delete process.env.MFA_ENCRYPTION_KEY;
    assert.throws(()=>new MysqlMfaStore({}),/MFA_ENCRYPTION_KEY/);
    process.env.MFA_ENCRYPTION_KEY=encoded;
    const store=new MysqlMfaStore({});
    assert.deepEqual(store.key,Buffer.alloc(32,17));
    assert.equal(store.open(store.seal('synthetic-secret')),'synthetic-secret');
    assert.throws(()=>new MysqlMfaStore({},null,'x'.repeat(32)),/Invalid MFA/);
  }finally{if(original===undefined)delete process.env.MFA_ENCRYPTION_KEY;else process.env.MFA_ENCRYPTION_KEY=original;}
});

test('fresh bootstrap metadata satisfies readiness; missing metadata or wrong MFA key fails closed',async()=>{
  const key=Buffer.alloc(32,7),pool=authSqlDouble(),auth=new MysqlMfaStore(pool,null,key);
  await assert.rejects(()=>auth.ready(),/initialized/);
  pool.metadata=[{key_sha256:'wrong'}];await assert.rejects(()=>auth.ready(),/matching MFA key/);
  pool.metadata=[{key_sha256:createHash('sha256').update(key).digest('hex')}];await auth.ready();
  for(const Store of [MysqlTreasuryStore,MysqlTrainingStore,MysqlCycleStore,MysqlHeritageStore]){
    let initialized=false;const statements=[];
    const execute=async(sql,args)=>{statements.push([sql,args]);return [initialized?[{id:1,service:args?.[0]}]:[]];};
    const store=new Store({execute,query:execute});
    await assert.rejects(()=>store.ready(),/initialized/);initialized=true;await store.ready();
    assert(statements.every(([sql])=>sql.startsWith('SELECT ')));
  }
});

test('SQL sessions enforce expiry, idle timeout, subject binding and revocation',async()=>{
  let now=100000;const pool=authSqlDouble(),store=new SessionStore(pool,()=>now),claims={jti:'test-session',sub:'member',exp:100000};
  await store.register(claims);assert.equal(await store.allowed(claims),true);
  assert.equal(await store.allowed({...claims,sub:'other'}),false);
  now+=29*60000;assert.equal(await store.allowed(claims,false),true);
  now+=2*60000;assert.equal(await store.allowed(claims,false),false);
  await store.register(claims);await store.revokeUser('member');assert.equal(await store.allowed(claims),false);
  await store.register(claims);await store.revoke(claims.jti);assert.equal(await store.allowed(claims),false);
  await store.register({...claims,exp:now/1000});assert.equal(await store.allowed(claims),false);
});

test('service transaction requires its SQL lock, rolls back failures and reuses nested connection',async()=>{
  const events=[];let lock=true;
  const connection={async beginTransaction(){events.push('begin');},async execute(sql,args){events.push(sql);return [lock?[{service:args[0]}]:[]];},async commit(){events.push('commit');},async rollback(){events.push('rollback');},release(){events.push('release');}};
  const store=new CycleStore({async getConnection(){return connection;}});
  assert.equal(await store.tx(()=>store.tx(async()=>42)),42);
  assert.equal(events.filter(e=>e==='begin').length,1);assert(events.includes('commit'));
  lock=false;await assert.rejects(()=>store.tx(()=>assert.fail('must not run')),/write lock/);
  assert.deepEqual(events.slice(-2),['rollback','release']);
});

test('treasury transaction retains maker-checker checks and rollback',async()=>{
  const events=[];
  const connection={async beginTransaction(){},async execute(sql){if(sql.startsWith('SELECT * FROM duranki_treasury_payment'))return [[{id:'p',status:'DRAFT',created_by:'maker'}]];throw Error('Unexpected write');},async commit(){events.push('commit');},async rollback(){events.push('rollback');},release(){events.push('release');}};
  const store=new TreasuryStore({async getConnection(){return connection;}});
  await assert.rejects(()=>store.transition('p','approve','maker'),/different authorised user/);
  await assert.rejects(()=>store.draft([],'maker'),/distinct receipts/);
  assert.deepEqual(events,['rollback','release','rollback','release']);
});

test('training helpers retain funding validation and private answer filtering',()=>{
  const modules=draftModules();assert.equal(modules.length,5);
  assert.throws(()=>validateModules(modules,true),{status:400});
  const published=validateModules(modules.map(m=>({...m,amountCents:100})),true);
  const view=trainingMemberView({id:'p',name:'Synthetic',community_id:'c',state:'PUBLISHED',modules:published},[]);
  assert.equal(view.modules[0].status,'AVAILABLE');assert.equal(view.modules[1].content,'');
  assert(!JSON.stringify(view).includes('correctIndex'));assert.equal(view.totalAmountCents,500);
});

test('SQL billing does not use the legacy SQLite constructor',()=>{
  const store={get db(){assert.fail('No db access permitted');}};
  assert.equal(new MysqlCycleBilling({store}).store,store);
});

test('MariaDB heritage and training routes await injected adapters even with databaseAvailable=true',async t=>{
  const app=express();
  const auth=(req,_res,next)=>{req.auth={sub:'member'};next();};
  const resolveUser=async()=>({id:'member',status:'active',roles:['Member']});
  let calls=0;
  app.use('/heritage',createHeritageRouter({requireAuth:auth,resolveUser,readState:()=>({}),databaseAvailable:true,store:{async get(sql){calls++;assert.match(sql,/heritage_person/);return {person_id:'public',display_name:'Synthetic',birth_date:'2000-01-01',death_date:'',verification:'Unverified'};}}}));
  app.use('/training',createTrainingRouter({requireAuth:auth,resolveUser,readState:()=>({}),databaseAvailable:true,store:{async list(){calls++;return [];}}}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>{server.closeAllConnections();server.close();});
  const url='http://127.0.0.1:'+server.address().port;
  assert.equal((await fetch(url+'/heritage/public/public')).status,200);
  assert.equal((await fetch(url+'/training/access')).status,200);assert.equal(calls,2);
});

test('cycle callback awaits SQL verification and allocation without the old cutover gate',async t=>{
  const events=[],app=express();app.use(express.raw({type:'application/json'}));
  app.use(createCycleRouter({databaseAvailable:true,config:()=>({ready:true}),requireAuth:(_req,res)=>res.sendStatus(401),store:{async notify(){events.push('verified');return {ok:true};}},billing:{async fulfil(id,event){assert.equal(id,'synthetic');assert.equal(event.status,'CHARGED');events.push('allocated');}}}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>{server.closeAllConnections();server.close();});
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/notifications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'synthetic',status:'CHARGED'})});
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});assert.deepEqual(events,['verified','allocated']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {selectAccountStorage} from '../src/account-storage.js';

function fixture({relational=false,document=true,empty=false,verified=true,disabled=true,corrupt=false}={}) {
  const bytes=Buffer.from(JSON.stringify({users:[],demoUsersDisabled:disabled}));
  let released=false;
  const pool={query:async sql=>{
    if(sql.includes('information_schema'))return [[...(relational?[{name:'users'}]:[]),...(document?[{name:'duranki_platform_document'}]:[])]];
    if(sql.includes('duranki_platform_migration'))return [verified?[{id:1}]:[]];
    return [empty?[]:[{id:'platform'}]];
  },getConnection:async()=>({
    beginTransaction:async()=>{},rollback:async()=>{},release:()=>{released=true;},
    execute:async sql=>sql.includes('SELECT *')?[[{chunk_count:1,byte_length:bytes.length,sha256:corrupt?'bad':createHash('sha256').update(bytes).digest('hex'),revision:1}]]:[[{chunk_index:0,payload:bytes}]]
  })};
  return {pool,released:()=>released};
}
test('legacy schemas and empty document tables retain relational accounts',async()=>{
  for(const options of [{relational:true,document:false},{relational:true,empty:true}]) {
    const env={};assert.equal(await selectAccountStorage(fixture(options).pool,env),'relational');assert.deepEqual(env,{});
  }
});
test('verified document selects only MariaDB stores and releases snapshot connection',async()=>{
  const f=fixture(),env={};assert.equal(await selectAccountStorage(f.pool,env),'platform');
  assert.equal(f.released(),true);assert.equal(Object.keys(env).length,6);
  assert.ok(Object.values(env).every(value=>value==='mariadb'));
  assert.equal(env.ALLOW_DEMO_AUTH,undefined);
});
test('ambiguous, unverified, corrupt and demo-enabled documents fail closed',async()=>{
  for(const options of [{relational:true},{verified:false},{corrupt:true},{disabled:false}]) {
    const env={};await assert.rejects(selectAccountStorage(fixture(options).pool,env));assert.deepEqual(env,{});
  }
});
test('explicit non-MariaDB configuration is not silently overwritten',async()=>{
  const env={AUTH_STORAGE:'sqlite'};
  await assert.rejects(selectAccountStorage(fixture().pool,env),{code:'ACCOUNT_STORAGE_CONFLICT'});
  assert.deepEqual(env,{AUTH_STORAGE:'sqlite'});
});
test('database failures are not treated as an empty or local account store',async()=>{
  await assert.rejects(selectAccountStorage({query:async()=>{throw Error('offline');}},{}),/offline/);
});

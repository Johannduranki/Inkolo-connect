import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {MysqlPlatformStore,readSqlDocument,writeSqlDocument} from '../src/mysql-platform-store.js';

test('SQL platform commits atomically, preserves unknown fields, locks writers and survives restart',async t=>{
 const pool=mysql.createPool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectionLimit:5});
 const id='sql-platform-test-'+randomUUID(),store=new MysqlPlatformStore(pool,id);let reopened;
 t.after(async()=>{
  await store.close();await reopened?.close();
  try{await pool.execute('DELETE FROM duranki_platform_chunk WHERE document_id=?',[id]);await pool.execute('DELETE FROM duranki_platform_document WHERE id=?',[id]);}finally{await pool.end();}
 });
 const source={users:[],unknown:{large:'x'.repeat(600000)},wallet:{balance:100},ledger:[],keys:{}};
 const c=await pool.getConnection();try{await c.beginTransaction();await writeSqlDocument(c,id,source,1);await c.commit();}finally{c.release();}
 await store.open();assert.deepEqual(store.read(),source);
 await assert.rejects(new MysqlPlatformStore(pool,id).open(),/Another platform writer/);
 assert.throws(()=>{store.read().wallet.balance=0;},TypeError);
 const transfer=key=>store.update(state=>{if(state.keys[key])return state.keys[key];if(state.wallet.balance<70)throw Error('Insufficient');state.wallet.balance-=70;state.ledger.push(key);state.keys[key]={key};return {key};});
 const same=await Promise.all([transfer('a'),transfer('a')]);assert.deepEqual(same,[{key:'a'},{key:'a'}]);
 assert.equal(store.read().wallet.balance,30);assert.equal(store.read().ledger.length,1);
 await assert.rejects(transfer('b'),/Insufficient/);
 assert.equal((await readSqlDocument(pool,id)).state.wallet.balance,30);
 const execute=store.connection.execute.bind(store.connection);let fail=true;
 store.connection.execute=async(sql,args)=>{if(fail&&sql.startsWith('INSERT INTO duranki_platform_chunk')){fail=false;throw Error('synthetic write failure');}return execute(sql,args);};
 await assert.rejects(store.update(state=>{state.wallet.balance=999;}),/synthetic write failure/);
 assert.equal(store.read().wallet.balance,30);assert.equal((await readSqlDocument(pool,id)).state.wallet.balance,30);
 store.connection.execute=execute;
 await store.close();reopened=new MysqlPlatformStore(pool,id);await reopened.open();
 assert.equal(reopened.read().wallet.balance,30);assert.equal(reopened.read().unknown.large,source.unknown.large);
 await reopened.update(state=>{state.unknown.large='small';});
 assert.equal((await readSqlDocument(pool,id)).state.unknown.large,'small');
 const [[chunks]]=await pool.execute('SELECT COUNT(*) n FROM duranki_platform_chunk WHERE document_id=?',[id]);assert.equal(chunks.n,1);
});

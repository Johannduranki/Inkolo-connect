import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import mysql from 'mysql2/promise';
import {MysqlPlatformStore,readSqlDocument,writeSqlDocument} from '../src/mysql-platform-store.js';

async function fixture(t,heartbeatMs=200){
 const pool=mysql.createPool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectionLimit:5});
 const id='recovery-test-'+randomUUID(),store=new MysqlPlatformStore(pool,id,{heartbeatMs});
 const c=await pool.getConnection();try{await c.beginTransaction();await writeSqlDocument(c,id,{balance:100,operations:[],preserved:{value:'synthetic'}},1);await c.commit();}finally{c.release();}
 t.after(async()=>{await store.close();await pool.execute('DELETE FROM duranki_platform_chunk WHERE document_id=?',[id]);await pool.execute('DELETE FROM duranki_platform_document WHERE id=?',[id]);await pool.end();});
 await store.open();return {pool,id,store};
}
async function kill(pool,store){const [[r]]=await store.connection.query('SELECT CONNECTION_ID() AS id');await pool.query('KILL CONNECTION ?',[r.id]);await delay(30);}

test('heartbeat keeps a writer alive past the database idle timeout',async t=>{
 const {store}=await fixture(t);const c=store.connection;
 await c.query('SET SESSION wait_timeout=1');await delay(2200);
 assert.equal(store.connection,c);assert.equal(store.read().balance,100);
 await store.update(s=>{s.balance+=1});assert.equal(store.read().balance,101);
});
test('lost connection reloads committed state and retains exclusive writer lock',async t=>{
 const {pool,id,store}=await fixture(t,60000);
 await kill(pool,store);assert.throws(()=>store.read(),/unavailable/);
 await store.maintain();assert.equal(store.read().balance,100);
 await assert.rejects(new MysqlPlatformStore(pool,id).open(),/Another platform writer/);
 await store.update(s=>{s.balance-=10});assert.equal((await readSqlDocument(pool,id)).state.balance,90);
});
test('another writer prevents recovery until its lock is released',async t=>{
 const {pool,id,store}=await fixture(t,60000);await kill(pool,store);
 const other=new MysqlPlatformStore(pool,id,{heartbeatMs:60000});await other.open();
 try{await other.update(s=>{s.balance=77});await assert.rejects(store.maintain(),/Another platform writer/);assert.equal(store.healthy,false);}finally{await other.close();}
 await store.maintain();assert.equal(store.read().balance,77);
});
test('lost commit acknowledgement is not replayed and reloads the committed result',async t=>{
 const {pool,id,store}=await fixture(t,60000);const original=store.connection.commit.bind(store.connection);let mutations=0;
 store.connection.commit=async()=>{await original();throw Error('Synthetic lost commit acknowledgement');};
 await assert.rejects(store.update(s=>{mutations++;s.balance-=30;s.operations.push('once')}),/lost commit/);
 assert.equal(store.healthy,false);await store.maintain();
 assert.equal(mutations,1);assert.equal(store.read().balance,70);assert.deepEqual(store.read().operations,['once']);
 assert.equal((await readSqlDocument(pool,id)).state.balance,70);
});
test('heartbeat recovers a killed connection without user requests and close stops retries',async t=>{
 const {pool,store}=await fixture(t);await kill(pool,store);await delay(650);
 assert.equal(store.read().balance,100);await store.close();const c=store.connection;
 await delay(400);assert.equal(store.connection,c);assert.equal(store.healthy,false);
 await assert.rejects(store.update(()=>{}),/unavailable/);
});

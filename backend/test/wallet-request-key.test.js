import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

test('deployed wallet requests reuse keys after failure and never persist payment details',async()=>{
 const storage=new Map(),sent=[];
 class Xhr {
  listeners={};open(){}abort(){}send(body){sent.push({xhr:this,body:JSON.parse(body)});}
  addEventListener(name,listener){this.listeners[name]=listener;}dispatchEvent(){}
 }
 const context={window:{},XMLHttpRequest:Xhr,URL,location:{href:'http://localhost:4200/dashboard',origin:'http://localhost:4200'},crypto:webcrypto,TextEncoder,Uint8Array,Event,sessionStorage:{getItem:key=>storage.get(key),setItem:(key,val)=>storage.set(key,val),removeItem:key=>storage.delete(key)}};
 vm.runInNewContext(readFileSync(new URL('../../frontend/public/wallet-request-key.js',import.meta.url),'utf8'),context);
 const submit=async()=>{const xhr=new Xhr();xhr.open('POST','/api/platform/wallet/transfer');xhr.send(JSON.stringify({amount:10,recipientTelephoneNumber:'0712345678'}));for(let i=0;i<100&&!sent.some(s=>s.xhr===xhr);i++)await new Promise(r=>setTimeout(r,2));return sent.find(s=>s.xhr===xhr);};
 const first=await submit(),retry=await submit();assert.ok(first);assert.equal(first.body.idempotencyKey,retry.body.idempotencyKey);
 assert.ok(!JSON.stringify([...storage]).includes('0712345678'));
 retry.xhr.status=201;retry.xhr.listeners.load();
 assert.notEqual((await submit()).body.idempotencyKey,first.body.idempotencyKey);
});

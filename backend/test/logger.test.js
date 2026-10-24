import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { once } from 'node:events';
import express from 'express';
import winston from 'winston';
import { createLogger, safeLog, requestLogging, errorDetails } from '../src/logger.js';

test('error metadata preserves event names without exposing exception text',async()=>{
  const lines=[];const stream=new Writable({write(chunk,_encoding,done){lines.push(chunk.toString());done();}});
  const log=createLogger({transports:[new winston.transports.Stream({stream})]});
  log.error('api_startup_failed',errorDetails(Object.assign(new Error('private credential'),{code:'ECONNREFUSED'})));
  const finished=once(log,'finish');log.end();await finished;
  const entry=JSON.parse(lines[0]);
  assert.equal(entry.message,'api_startup_failed');assert.equal(entry.errorCode,'ECONNREFUSED');
  assert.equal(lines.join('').includes('private credential'),false);
});

test('Winston emits JSON and drops secrets, payloads and arbitrary error text',async()=>{
  const lines=[];const stream=new Writable({write(chunk,_encoding,done){lines.push(chunk.toString());done();}});
  const log=createLogger({transports:[new winston.transports.Stream({stream})]});
  log.info('request_failed',{password:'secret-password',headers:{authorization:'Bearer private-token'},body:{idNumber:'private-id'},error:new Error('SQL contains private-data'),status:500});
  log.error('raw secret-password');
  const finished=once(log,'finish');log.end();await finished;
  const output=lines.join('');for(const secret of ['secret-password','private-token','private-id','private-data'])assert.equal(output.includes(secret),false);
  const entry=JSON.parse(lines[0]);assert.equal(entry.message,'request_failed');assert.equal(entry.service,'duranki-api');assert.equal(entry.status,500);assert.ok(entry.timestamp);
  assert.equal(JSON.parse(lines[1]).message,'redacted_event');
  assert.equal(safeLog({level:'info',message:'event',requestId:'forged\nrequest',route:'/url?token=secret'}).route,undefined);
});
test('request logs use route templates, unique server IDs and status without query/body/header data',async t=>{
  const entries=[];const app=express();app.use(requestLogging({log:(level,message,data)=>entries.push({level,message,...data})}));app.use(express.json());
  app.post('/members/:id',(_req,res)=>res.sendStatus(403));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/members/private-id?token=private-token',{method:'POST',headers:{'Content-Type':'application/json','X-Request-Id':'forged','Authorization':'Bearer private-token'},body:JSON.stringify({password:'secret-password'})});await response.text();
  assert.match(response.headers.get('x-request-id'),/^[a-f0-9-]{36}$/);assert.equal(entries.length,1);assert.equal(entries[0].route,'/members/:id');assert.equal(entries[0].status,403);assert.equal(entries[0].level,'warn');assert.ok(entries[0].durationMs>=0);
  assert.equal(JSON.stringify(entries).includes('private'),false);assert.equal(JSON.stringify(entries).includes('secret'),false);
});

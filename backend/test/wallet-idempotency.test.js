import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {createPlatformRouter} from '../src/platform-api.js';

test('wallet API persists replay keys with both ledger entries and rejects changed details',async t=>{
 let state={users:[{id:'sender',status:'active',roles:['Member']},{id:'receiver',status:'active',firstName:'Test',lastName:'Recipient',telephoneNumber:'0712345678'}],wallets:[{id:'a',ownerType:'MEMBER',ownerId:'sender',balance:100,availableBalance:100,status:'ACTIVE',currency:'ZAR'},{id:'b',ownerType:'MEMBER',ownerId:'receiver',balance:0,availableBalance:0,status:'ACTIVE',currency:'ZAR'}],walletTransactions:[]};
 let writes=Promise.resolve();
 const update=fn=>{const result=writes.then(async()=>{await new Promise(resolve=>setTimeout(resolve,5));const draft=structuredClone(state),result=fn(draft);state=draft;return result;});writes=result.catch(()=>{});return result;};
 const app=express();app.use(express.json());app.use('/platform',createPlatformRouter({requireAuth:(req,res,next)=>{req.auth={sub:'sender'};next();},readPlatformState:()=>state,updatePlatformState:update}));
 app.use((err,req,res,next)=>res.status(err.status||500).json({message:'Rejected'}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{server.closeAllConnections();server.close();});
 const transfer=body=>fetch(`http://127.0.0.1:${server.address().port}/platform/wallet/transfer`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const body={amount:70,recipientTelephoneNumber:'0712345678',idempotencyKey:randomUUID()};
 const responses=await Promise.all([transfer(body),transfer(body)]);assert.deepEqual(responses.map(r=>r.status),[201,201]);
 const results=await Promise.all(responses.map(r=>r.json()));assert.equal(results[0].reference,results[1].reference);
 assert.equal(state.wallets[0].balance,30);assert.equal(state.wallets[1].balance,70);assert.equal(state.walletTransactions.length,2);assert.equal(state.walletTransferRequests.length,1);
 assert.equal((await transfer({...body,amount:20})).status,409);
 assert.equal((await transfer({...body,idempotencyKey:undefined})).status,400);
 assert.equal((await transfer({...body,idempotencyKey:randomUUID()})).status,409);
 assert.equal(state.wallets[0].balance,30);
});

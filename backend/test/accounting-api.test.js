import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { accountingSnapshot, addAccountingEmployees, addAccountingCode, createAccountingRouter } from '../src/accounting-api.js';

const fixture = () => ({users:[{id:1,status:'active',roles:['Platform Admin']},{id:2,status:'active',roles:['Tenant Staff']},{id:3,status:'inactive',roles:['Accountant']}]});
const employee = {fullName:'Fixture Employee',employeeNumber:'A1',role:'Clerk',scopeCode:'DUR',grossSalary:10000};

test('accounting starts with empty persisted records, not sample financial totals',()=>{
  const snapshot = accountingSnapshot(fixture());
  assert.equal(Object.keys(snapshot).length,7);
  assert(Object.values(snapshot).every(rows=>rows.length===0));
});
test('employee import is atomic, validates money and rejects duplicate entity employee numbers',()=>{
  const state=fixture();
  assert.throws(()=>addAccountingEmployees(state,[employee,{...employee,employeeNumber:'A2',grossSalary:-1}],1),{status:400});
  assert.equal(state.accountingEmployees,undefined);
  for(const invalid of [NaN,Infinity,true,'',1.234]) assert.throws(()=>addAccountingEmployees(state,[{...employee,grossSalary:invalid}],1),{status:400});
  const rows=addAccountingEmployees(state,[{...employee,entity:'Untrusted entity'}],1);
  assert.equal(rows[0].entity,'Duranki Platform');
  assert.throws(()=>addAccountingEmployees(state,[{...employee,employeeNumber:'a1'}],1),{status:409});
  assert.equal(state.accountingEmployees.length,1);
});
test('scope codes are unique and reserved platform code cannot be reassigned',()=>{
  const state=fixture();const code={scopeType:'TENANT',scopeId:'tenant-a',name:'A',shortCode:'TNA'};
  addAccountingCode(state,code,1);
  assert.throws(()=>addAccountingCode(state,{...code,scopeId:'tenant-b'},1),{status:409});
  assert.throws(()=>addAccountingCode(state,{...code,shortCode:'DUR'},1),{status:400});
  assert.throws(()=>addAccountingEmployees(state,[{...employee,scopeCode:'UNKNOWN'}],1),{status:400});
});
test('accounting API rejects tenant access and fake settlements; authorized employee saves are audited',async()=>{
  const state=fixture();const app=express();app.use(express.json());
  app.use((req,_res,next)=>{req.auth={sub:req.get('x-user')};next();});
  app.use('/accounting',createAccountingRouter({readState:()=>state,updateState:fn=>fn(state)}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}/accounting`;
  const headers={'x-user':'1','Content-Type':'application/json'};
  try {
    for(const user of ['','2','3']) assert.equal((await fetch(base,{headers:{'x-user':user}})).status,403);
    assert.equal((await fetch(base,{headers})).status,200);
    assert.equal((await fetch(base+'/employees',{method:'POST',headers,body:JSON.stringify(employee)})).status,201);
    assert.equal(state.accountingEmployees.length,1);assert.equal(state.accountingAudit.length,1);
    for(const path of ['payments','ledger-entries','tenant-invoices']) assert.equal((await fetch(base+'/'+path,{method:'POST',headers,body:'{}'})).status,503);
    assert.equal((await fetch(base+'/fund-movements/example/reconcile',{method:'PATCH',headers,body:'{}'})).status,503);
    assert.equal(state.accountingPayments,undefined);assert.equal(state.accountingLedgerEntries,undefined);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

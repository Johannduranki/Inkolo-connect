import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../../frontend/node_modules/typescript/lib/typescript.js';
const ast=ts.createSourceFile('bundle.js',fs.readFileSync(new URL('../../frontend/dist/duranki-login/browser/main-4DAPJI7G.js',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
let method;
function visit(n){if(ts.isMethodDeclaration(n)&&n.name.getText(ast)==='loadConfiguredServicePrices')method=n.getText(ast);ts.forEachChild(n,visit);}
visit(ast);
test('member plans use server prices and never fall back to old mock prices',async()=>{
  let opened=false;
  const context={services:[{code:'catch-a-ride',name:'Catch a Lift',plans:[{price:'R49'}]},{code:'trader-training',name:'Trader Training',plans:[]},{code:'wallet',name:'Wallet',plans:[{price:'R99'}]}],openRequestedService:()=>opened=true,subscriptionError:{set:()=>assert.fail('Unexpected fetch failure')}};
  const load=vm.runInNewContext('({'+method+'})',{sessionStorage:{getItem:()=>null},localStorage:{getItem:()=>null},fetch:async()=>({ok:true,json:async()=>({services:[{code:'deliveries',mode:'paid',amountCents:3550},{code:'trader-training',mode:'free',amountCents:0},{code:'wallet',mode:'unconfigured',amountCents:null}]})})}).loadConfiguredServicePrices;
  load.call(context);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(context.services[0].plans[0].price,'R35.50 / month');
  assert.equal(context.services[0].plans[0].code,'configured-monthly');
  assert.equal(context.services[1].plans[0].price,'Free');
  assert.equal(context.services[2].plans.length,0);assert.equal(opened,true);
});

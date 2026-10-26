import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../../frontend/node_modules/typescript/lib/typescript.js';
const source=ts.transpileModule(fs.readFileSync(new URL('../../frontend/src/app/dashboard.component.ts',import.meta.url),'utf8'), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const ast=ts.createSourceFile('component.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
let method;
function visit(n){if(ts.isMethodDeclaration(n)&&n.name.getText(ast)==='loadConfiguredServicePrices')method=n.getText(ast);ts.forEachChild(n,visit);}
visit(ast);assert.ok(method,'Expected current component method');
import { memberCapabilities, reconcileMemberCatalogue, programmeContext } from '../../frontend/public/member-service-catalogue.js';

function harness(fetch) {
  const errors=[];
  let renders=0;
  const context={catalogueRequest:0,auth:{getToken:()=> 'synthetic-token'},memberCommunity:()=>({churchId:'selected'}),
    services:[{code:'catch-a-ride',name:'Catch a Lift',plans:[{price:'R49'}]},{code:'trader-training',name:'Trader Training',plans:[]},{code:'wallet',name:'Wallet',plans:[{price:'R99'}]}],
    subscriptionError:{set:value=>errors.push(value)},changeDetector:{markForCheck:()=>renders++}};
  const load=vm.runInNewContext('({'+method+'})',{memberCapabilities,reconcileMemberCatalogue,programmeContext,
    URLSearchParams,window:{location:{search:'?communityId=selected'}},fetch}).loadConfiguredServicePrices;
  return {context,errors,renders:()=>renders,load:()=>load.call(context)};
}

test('member plans use server prices, selected community and published training without mock prices',async()=>{
  const calls=[];
  const h=harness(async(path,options)=>{
    calls.push(path);assert.equal(options.cache,'no-store');assert.equal(options.headers.Authorization,'Bearer synthetic-token');
    return {ok:true,json:async()=>path.startsWith('/api/service-pricing')?{services:[
      {code:'deliveries',name:'Deliveries',mode:'paid',amountCents:3550},
      {code:'trader-training',name:'Training',mode:'free',amountCents:0},
      {code:'wallet',name:'Wallet',mode:'unconfigured',amountCents:null}
    ]}:{communities:[{id:'selected'}],programmes:[{communityId:'selected',state:'PUBLISHED'}]}};
  });
  await h.load();
  assert.deepEqual(calls,['/api/service-pricing?member=true&communityId=selected','/api/trader-training/access']);
  assert.equal(h.context.services[0].plans[0].price,'R35.50 / month');
  assert.equal(h.context.services[0].plans[0].code,'configured-monthly');
  assert.equal(h.context.services[0].catalogueStatus,'Payment setup required');
  assert.equal(h.context.services[1].plans[0].price,'Free');
  assert.equal(h.context.services[1].catalogueBlocked,false);
  assert.equal(h.context.services[2].plans.length,0);
  assert.equal(h.renders(),1);assert.deepEqual(h.errors,[]);
});

test('failed pricing clears mock prices and reports failure without claiming availability',async()=>{
  const h=harness(async()=>({ok:false,status:503}));
  await h.load();
  assert.ok(h.context.services.every(service=>service.plans.length===0&&service.catalogueBlocked));
  assert.match(h.errors[0],/pricing could not be loaded/);assert.equal(h.renders(),0);
});

test('a delayed pricing response never replaces a newer selected catalogue',async()=>{
  let finish;
  let pricingCalls=0;
  const h=harness(async path=>{
    if(!path.startsWith('/api/service-pricing'))return {ok:false};
    if(++pricingCalls===1)return new Promise(resolve=>{finish=resolve;});
    return {ok:true,json:async()=>({services:[{code:'deliveries',name:'Current',mode:'free',amountCents:0}]})};
  });
  const older=h.load();await h.load();
  finish({ok:true,json:async()=>({services:[{code:'deliveries',name:'Stale',mode:'paid',amountCents:4900}]})});
  await older;
  assert.equal(h.context.services[0].name,'Current');
  assert.equal(h.context.services[0].plans[0].price,'Free');
  assert.equal(h.renders(),1);
});

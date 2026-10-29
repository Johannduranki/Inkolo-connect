import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../../frontend/node_modules/typescript/lib/typescript.js';
import { configuredSubscriptionPlan } from '../src/service-pricing.js';
import { memberServiceScope } from '../src/service-scope.js';
const source=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const ast=ts.createSourceFile('app.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
let plans,handler;
function visit(node){
  if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='servicePlans')plans=node.initializer.getText(ast);
  if(ts.isCallExpression(node)&&node.expression.getText(ast)==='app.post'&&node.arguments[0]?.text==='/api/subscriptions')handler=node.arguments[2].getText(ast);
  ts.forEachChild(node,visit);
}
visit(ast);
function fixture(state){
  const saved=[],acceptances=[];
  const context={servicePlans:vm.runInNewContext('('+plans+')'),databaseAvailable:false,config:{allowDemoAuth:true},getDemoUserById:()=>({id:7,status:'active'}),createAcceptanceEvidence:data=>({serviceCode:data.serviceCode,planCode:data.planCode}),saveDemoAcceptance:value=>acceptances.push(value),saveDemoSubscription:(userId,value)=>{const subscription={...value,userId,status:'active'};saved.push(subscription);return subscription;},mapSubscription:value=>value};
  context.configuredSubscriptionPlan=configuredSubscriptionPlan;
  context.allowPlatformAccounts=true;
  context.memberServiceScope=memberServiceScope;
  context.readPlatformState=()=>state||({servicePricing:{'trader-training':{mode:'free',amountCents:0},'grant-distribution':{mode:'free',amountCents:0}}});
  const run=vm.runInNewContext('('+handler+')',context);
  return {saved,acceptances,async request(body){const response={code:200,body:null,status(code){this.code=code;return this;},json(value){this.body=value;return this;}};await run({auth:{sub:7},body},response,error=>{throw error;});return response;}};
}
test('free Trader Training subscription is accepted without recording money',async()=>{
  const f=fixture(),res=await f.request({serviceCode:'trader-training',planCode:'free',acceptance:{accepted:true}});
  assert.equal(res.code,201);assert.equal(res.body.amountCents,0);assert.equal(res.body.status,'active');assert.equal(res.body.planLabel,'Trader Training access');assert.equal(f.saved.length,1);assert.equal(f.acceptances.length,1);
});

test('new free access saves canonical membership scope and cannot bypass Duranki paid pricing',async()=>{
  const state={tenantAccessDirectory:[{id:'tenant-a',name:'Tenant A'}],importedCommunities:[{id:'legacy-a',platformCommunityId:'community-a',tenantId:'tenant-a'}],memberCommunities:[{memberId:'7',communityId:'legacy-a',tenantId:'tenant-a'}],servicePricing:{'trader-training':{mode:'free',amountCents:0}},tenantServicePricing:{'tenant-a':{'trader-training':{inheritPrice:true,enabled:true}}},communityServicePricing:{'community-a':{'trader-training':{inheritPrice:true,enabled:true}}}};
  state.durankiServiceAssignments={'tenant-a':{serviceCodes:['trader-training'],revision:1}};
  const f=fixture(state),body={serviceCode:'trader-training',planCode:'free',acceptance:{accepted:true}};
  assert.equal((await f.request(body)).code,201);assert.equal(f.saved[0].communityId,'community-a');assert.equal(f.saved[0].tenantId,'tenant-a');
  state.communityServicePricing['community-a']['trader-training']={enabled:true,mode:'paid',amountCents:500};
  state.servicePricing['trader-training']={enabled:true,mode:'paid',amountCents:500};
  assert.equal((await f.request(body)).code,400);assert.equal(f.saved.length,1);
});
test('training requires terms and rejects unknown plans before saving',async()=>{
  const f=fixture();
  assert.equal((await f.request({serviceCode:'trader-training',planCode:'free',acceptance:{accepted:false}})).code,400);
  assert.equal((await f.request({serviceCode:'trader-training',planCode:'paid',acceptance:{accepted:true}})).code,400);
  assert.equal(f.saved.length,0);assert.equal(f.acceptances.length,0);
});
test('free Grant Distribution subscription is accepted without approving or paying a grant',async()=>{
  const f=fixture(),res=await f.request({serviceCode:'grant-distribution',planCode:'free',acceptance:{accepted:true}});
  assert.equal(res.code,201);
  assert.equal(res.body.serviceCode,'grant-distribution');
  assert.equal(res.body.planLabel,'Grant Distribution access');
  assert.equal(res.body.amountCents,0);
  assert.equal(res.body.status,'active');
  assert.equal(f.saved.length,1);
  assert.equal(f.acceptances.length,1);
  assert.equal(f.acceptances[0].serviceCode,'grant-distribution');
  assert.equal(res.body.grantApproved,undefined);
  assert.equal(res.body.payment,undefined);
});
test('grant access requires terms and rejects unrecognized or paid plans',async()=>{
  const f=fixture();
  for(const body of [
    {serviceCode:'grant-distribution',planCode:'free',acceptance:{accepted:false}},
    {serviceCode:'grant-distribution',planCode:'free'},
    {serviceCode:'grant-distribution',planCode:'paid',acceptance:{accepted:true}},
    {serviceCode:'grant-distribution',planCode:'unknown',acceptance:{accepted:true}}
  ])assert.equal((await f.request(body)).code,400);
  assert.equal(f.saved.length,0);
  assert.equal(f.acceptances.length,0);
});

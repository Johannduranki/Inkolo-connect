import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../../frontend/node_modules/typescript/lib/typescript.js';
const source=ts.transpileModule(fs.readFileSync(new URL('../../frontend/src/app/dashboard.component.ts',import.meta.url),'utf8'), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const ast=ts.createSourceFile('component.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const methods={};
function visit(node){if(ts.isMethodDeclaration(node)&&['openService','confirmSubscription'].includes(node.name.getText(ast))&&(node.getText(ast).includes('communityMembershipAccess')||node.getText(ast).includes('this.confirmSubscription()')))methods[node.name.getText(ast)]=node.getText(ast);ts.forEachChild(node,visit);}
visit(ast);
for(const name of ['openService','confirmSubscription'])assert.ok(methods[name],name);
for(const name of ['openService','confirmSubscription'])test(name+' honours server exemption without a payment',()=>{
  let destination;
  const handler=vm.runInNewContext('({'+methods[name]+'})',{window:{location:{assign:url=>destination=url}}})[name];
  const context={selectedPlanCode:()=> 'configured-monthly',user:()=>({communityMembershipAccess:{exempt:true}}),memberCommunity:()=>({churchId:'trader-ilembe'}),selectedService:()=>({code:'community-membership'})};
  const component=vm.runInNewContext('({'+Object.values(methods).join(',')+'})',{window:{location:{assign:url=>destination=url}}});
  Object.assign(context,component);
  handler.call(context,{code:'community-membership'});
  assert.equal(destination,'/community?communityId=trader-ilembe');
});
for(const name of ['confirmSubscription'])test(name+' never fabricates a member payment',()=>{
  let message;
  const handler=vm.runInNewContext('({'+methods[name]+'})')[name];
  const context={user:()=>({roles:['Member']}),selectedService:()=>({code:'community-membership'}),selectedPlanCode:()=> 'configured-monthly',subscriptionError:{set:value=>message=value}};
  Object.assign(context,vm.runInNewContext('({'+Object.values(methods).join(',')+'})'));
  handler.call(context);
  assert.match(message,/not connected/);
});

test('membership payment uses the current confirmation control, not the retired wallet handler',()=>{
  const template=fs.readFileSync(new URL('../../frontend/src/app/dashboard.component.html',import.meta.url),'utf8');
  assert.match(template,/\(click\)="confirmSubscription\(\)"/);
  assert.doesNotMatch(template,/payCommunityMembershipFromWallet/);
});

test('paid membership entry navigates to scoped checkout without fabricating payment',()=>{
  let destination;
  const handler=vm.runInNewContext('({'+methods.openService+'})',{window:{location:{assign:url=>destination=url}}}).openService;
  handler.call({isServiceActive:()=>false,memberCommunity:()=>({churchId:'synthetic community'})},
    {code:'community-membership',catalogueStatus:'Cycle Pay checkout'});
  assert.equal(destination,'/payments/cycle?service=community-membership&communityId=synthetic%20community');
});

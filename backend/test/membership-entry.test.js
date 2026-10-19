import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../../frontend/node_modules/typescript/lib/typescript.js';
const source=fs.readFileSync(new URL('../../frontend/dist/duranki-login/browser/main-4DAPJI7G.js',import.meta.url),'utf8');
const ast=ts.createSourceFile('bundle.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const methods={};
function visit(node){if(ts.isMethodDeclaration(node)&&['openService','confirmSubscription','payCommunityMembershipFromWallet'].includes(node.name.getText(ast))&&(node.getText(ast).includes('communityMembershipAccess')||node.getText(ast).includes('this.confirmSubscription()')))methods[node.name.getText(ast)]=node.getText(ast);ts.forEachChild(node,visit);}
visit(ast);
for(const name of ['openService','confirmSubscription','payCommunityMembershipFromWallet'])test(name+' honours server exemption without a payment',()=>{
  let destination;
  const handler=vm.runInNewContext('({'+methods[name]+'})',{window:{location:{assign:url=>destination=url}}})[name];
  const context={user:()=>({communityMembershipAccess:{exempt:true}}),memberCommunity:()=>({churchId:'trader-ilembe'}),selectedService:()=>({code:'community-membership'})};
  const component=vm.runInNewContext('({'+Object.values(methods).join(',')+'})',{window:{location:{assign:url=>destination=url}}});
  Object.assign(context,component);
  handler.call(context,{code:'community-membership'});
  assert.equal(destination,'/community?communityId=trader-ilembe');
});
for(const name of ['confirmSubscription','payCommunityMembershipFromWallet'])test(name+' never fabricates a member payment',()=>{
  let message;
  const handler=vm.runInNewContext('({'+methods[name]+'})')[name];
  const context={user:()=>({roles:['Member']}),selectedService:()=>({code:'community-membership'}),selectedPlanCode:()=> 'configured-monthly',subscriptionError:{set:value=>message=value}};
  Object.assign(context,vm.runInNewContext('({'+Object.values(methods).join(',')+'})'));
  handler.call(context);
  assert.match(message,/not connected/);
});

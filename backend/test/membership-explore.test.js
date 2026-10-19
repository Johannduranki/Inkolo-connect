import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../../frontend/node_modules/typescript/lib/typescript.js';
const ast=ts.createSourceFile('bundle.js',fs.readFileSync(new URL('../../frontend/dist/duranki-login/browser/main-4DAPJI7G.js',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
let method;
function visit(node){if(ts.isMethodDeclaration(node)&&node.name.getText(ast)==='availableServices'&&node.getText(ast).includes('communityScopedServices'))method=node.getText(ast);ts.forEachChild(node,visit);}
visit(ast);
const available=vm.runInNewContext('({'+method+'})').availableServices;
const services=[{code:'community-membership'},{code:'grant-distribution'},{code:'trader-training'}];
for(const [label,exempt,active,expected] of [
  ['exempt administrator',true,false,2],
  ['subscribed member',false,true,2],
  ['unsubscribed member',false,false,3]
])test('Explore membership visibility for '+label,()=>{
  const result=available.call({communityScopedServices:()=>services,user:()=>({communityMembershipAccess:{exempt}}),isServiceActive:service=>active&&service.code==='community-membership'});
  assert.equal(result.length,expected);
  assert.equal(result.some(service=>service.code==='community-membership'),expected===3);
});

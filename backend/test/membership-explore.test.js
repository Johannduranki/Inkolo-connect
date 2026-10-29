import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../../frontend/node_modules/typescript/lib/typescript.js';
import { scopedMemberCatalogue } from '../../frontend/public/member-service-catalogue.js';
const source=ts.transpileModule(fs.readFileSync(new URL('../../frontend/src/app/dashboard.component.ts',import.meta.url),'utf8'), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const ast=ts.createSourceFile('component.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
let method;
function visit(node){if(ts.isMethodDeclaration(node)&&node.name.getText(ast)==='availableServices'&&node.getText(ast).includes('scopedMemberCatalogue'))method=node.getText(ast);ts.forEachChild(node,visit);}
visit(ast);assert.ok(method,'Expected current component method');
const available=vm.runInNewContext('({'+method+'})',{scopedMemberCatalogue}).availableServices;
const services=[{code:'community-membership'},{code:'grant-distribution'},{code:'trader-training'}].map(s=>({...s,catalogueConfigured:true}));
for(const [label,exempt,active,expected] of [
  ['exempt administrator',true,false,2],
  ['subscribed member',false,true,2],
  ['unsubscribed member',false,false,3]
])test('Explore membership visibility for '+label,()=>{
  const result=available.call({services,memberCommunity:()=>({serviceConfiguration:{serviceCodes:services.map(s=>s.code)}}),user:()=>({communityMembershipAccess:{exempt}}),isServiceActive:service=>active&&service.code==='community-membership'});
  assert.equal(result.length,expected);
  assert.equal(result.some(service=>service.code==='community-membership'),expected===3);
});

test('Explore fails closed without configuration and excludes services outside the selected scope',()=>{
  const context={services,user:()=>({roles:['Member']}),isServiceActive:()=>false};
  assert.equal(available.call({...context,memberCommunity:()=>null}).length,0);
  const result=available.call({...context,memberCommunity:()=>({serviceConfiguration:{serviceCodes:['trader-training']}})});
  assert.deepEqual(Array.from(result,service=>service.code),['trader-training']);
});

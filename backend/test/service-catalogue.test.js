import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../../frontend/node_modules/typescript/lib/typescript.js';
const ast=ts.createSourceFile('bundle.js',fs.readFileSync(new URL('../../frontend/dist/duranki-login/browser/main-4DAPJI7G.js',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
let method;
function visit(node){if(ts.isMethodDeclaration(node)&&node.name.getText(ast)==='normalizeServices')method=node.getText(ast);ts.forEachChild(node,visit);}
visit(ast);
test('catalogue restores developed referral and property entries and explains ride setting',()=>{
  const normalize=vm.runInNewContext('({'+method+'})',{gx:[{code:'deliveries',name:'Deliveries'}],hx:{}}).normalizeServices;
  const result=normalize.call({createDashboardRoute:name=>'/dashboard/services/'+name},[]);
  assert.equal(result.find(s=>s.code==='deliveries').name,'Catch a Ride / Deliveries');
  assert.equal(result.filter(s=>s.code==='referral').length,1);
  assert.equal(result.filter(s=>s.code==='keycha-properties').length,1);
  const again=normalize.call({createDashboardRoute:name=>'/dashboard/services/'+name},result);
  assert.equal(again.length,result.length);
});

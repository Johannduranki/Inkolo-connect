import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../../frontend/node_modules/typescript/lib/typescript.js';
const source=ts.transpileModule(fs.readFileSync(new URL('../../frontend/src/app/features/platform-admin/platform-admin-dashboard/platform-admin-dashboard.component.ts',import.meta.url),'utf8'), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const ast=ts.createSourceFile('component.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
let method;
function visit(node){if(ts.isMethodDeclaration(node)&&node.name.getText(ast)==='normalizeServices')method=node.getText(ast);ts.forEachChild(node,visit);}
visit(ast);assert.ok(method,'Expected current component method');
const declarations=[];
for(const statement of ast.statements)if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations)if(['defaultService','defaultServices','serviceCodeAliases'].includes(declaration.name.getText(ast)))declarations.push('const '+declaration.getText(ast)+';');
assert.equal(declarations.length,3);
const dependencies=vm.runInNewContext(declarations.join('\n')+'\n({defaultServices,serviceCodeAliases})');

test('catalogue restores developed referral and property entries and explains ride setting',()=>{
  const normalize=vm.runInNewContext('({'+method+'})',dependencies).normalizeServices;
  const result=normalize.call({createDashboardRoute:name=>'/dashboard/services/'+name},[]);
  assert.equal(result.find(s=>s.code==='deliveries').name,'Catch a Ride / Deliveries');
  assert.equal(result.filter(s=>s.code==='referral').length,1);
  assert.equal(result.filter(s=>s.code==='keycha-properties').length,1);
  const again=normalize.call({createDashboardRoute:name=>'/dashboard/services/'+name},result);
  assert.equal(again.length,result.length);
});

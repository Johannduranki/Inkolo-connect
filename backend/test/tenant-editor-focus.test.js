import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../../frontend/node_modules/typescript/lib/typescript.js';
test('tenant edit loads values then scrolls and focuses after rendering without saving',()=>{
  const source=ts.transpileModule(fs.readFileSync(new URL('../../frontend/src/app/features/platform-admin/platform-admin-dashboard/platform-admin-dashboard.component.ts',import.meta.url),'utf8'), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  const ast=ts.createSourceFile('component.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let method;
  function visit(n){if(ts.isMethodDeclaration(n)&&n.name.getText(ast)==='loadTenantForEdit')method=n.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert.ok(method);
  const calls=[],frames=[],fields={};
  const editor={scrollIntoView:options=>calls.push(['scroll',options.block]),querySelector:()=>({focus:options=>calls.push(['focus',options.preventScroll])})};
  const handler=vm.runInNewContext('({'+method+'})',{requestAnimationFrame:fn=>frames.push(fn),document:{querySelector:selector=>{assert.equal(selector,'.platform-page .form-panel');return editor;}}}).loadTenantForEdit;
  const controls=new Proxy({}, {get:(_target,name)=>({set:value=>{fields[name]=value;},setValue:value=>{fields[name]=value;}})});
  const tenant={id:'tenant-inkolo',name:'Inkolo',branding:{},tenantAdmin:{},websiteConfig:{},pricing:{},serviceCodes:[]};
  handler.call(controls,tenant);assert.equal(fields.tenantName,'Inkolo');assert.equal(fields.editingTenantId,'tenant-inkolo');assert.equal(fields.view,'platform');assert.deepEqual(calls,[]);assert.equal(frames.length,1);frames[0]();assert.deepEqual(calls,[['scroll','start'],['focus',true]]);
});

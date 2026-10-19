import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../../frontend/node_modules/typescript/lib/typescript.js';
const source=fs.readFileSync(new URL('../../frontend/dist/duranki-login/browser/main-4DAPJI7G.js',import.meta.url),'utf8');
const ast=ts.createSourceFile('bundle.js',source,99,true,ts.ScriptKind.JS);let method,init;
function visit(n){if(ts.isMethodDeclaration(n)&&n.name.getText(ast)==='loadUploadedBranding'){method=n.getText(ast);init=n.parent.members.find(m=>m.name?.getText(ast)==='ngOnInit').getText(ast);}ts.forEachChild(n,visit);}visit(ast);
test('admin loads uploaded logos by scope ID, preserves other settings and fallback logos',async()=>{
  const url='/api/branding/images/'+'a'.repeat(64);
  let tenants=[{id:'tenant-inkolo',branding:{logoUrl:'',primaryColor:'blue'}},{id:'tenant-other',branding:{logoUrl:'/original.png'}}];
  let communities=[{id:'trader-ilembe',branding:{logoUrl:''}}];
  const original=structuredClone(tenants);
  const context={sessionStorage:{getItem:()=> 'session'},localStorage:{getItem:()=>null},fetch:async(path,options)=>{assert.equal(path,'/api/branding');assert.equal(options.cache,'no-store');return {ok:true,json:async()=>[{kind:'tenant',id:'tenant-inkolo',logoUrl:url},{kind:'community',id:'community-traders',aliases:['trader-ilembe'],logoUrl:url},{kind:'tenant',id:'tenant-other',logoUrl:'javascript:alert(1)'}]};}};
  const load=vm.runInNewContext('({'+method+'})',context).loadUploadedBranding;
  const component={tenants:{update:fn=>{tenants=fn(tenants);}},communities:{update:fn=>{communities=fn(communities);}}};
  await load.call(component);assert.ok(init.includes('this.loadUploadedBranding()'));assert.equal(tenants[0].branding.logoUrl,url);assert.equal(tenants[0].branding.primaryColor,'blue');assert.equal(tenants[1].branding.logoUrl,'/original.png');assert.equal(communities[0].branding.logoUrl,url);assert.equal(original[0].branding.logoUrl,'');
  context.fetch=async()=>({ok:false});await load.call(component);assert.equal(tenants[0].branding.logoUrl,url);
});

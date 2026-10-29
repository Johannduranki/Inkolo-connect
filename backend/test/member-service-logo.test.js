import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../../frontend/node_modules/typescript/lib/typescript.js';
import {reconcileMemberCatalogue} from '../../frontend/public/member-service-catalogue.js';
const source=fs.readFileSync(new URL('../../frontend/src/app/dashboard.component.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('component.ts',source,ts.ScriptTarget.Latest,true);
let method;
function visit(n){if(ts.isMethodDeclaration(n)&&n.name.getText(ast)==='serviceLogo')method=n.getText(ast);ts.forEachChild(n,visit);}
visit(ast);
const compiled=ts.transpileModule('const methods={'+method+'};',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const logo=vm.runInNewContext(compiled+'methods.serviceLogo');
test('service logo falls back to the selected community then branding, without retry loops',()=>{
  const failed=[];
  const ctx={memberCommunity:()=>({churchId:'legacy',serviceConfiguration:{id:'canonical'}}),communityChurches:()=>[{id:'other',branding:{logoUrl:'/other.png'}},{id:'canonical',branding:{logoUrl:'/community.png'}}],failedServiceImages:()=>failed};
  assert.equal(logo.call(ctx,{image:'/service.png'}),'/service.png');
  assert.equal(logo.call(ctx,{image:''}),'/community.png');
  failed.push('/service.png');
  assert.equal(logo.call(ctx,{image:'/service.png'}),'/community.png');
  failed.push('/community.png');
  assert.equal(logo.call(ctx,{image:''}),'/duranki-up-logo.png');
  failed.push('/duranki-up-logo.png');
  assert.equal(logo.call(ctx,{image:''}),'');
});
test('catalogue preserves service and configured funeral logos without inserting generic placeholders',()=>{
  assert.equal(reconcileMemberCatalogue([],[{code:'jobs'}])[0].image,'');
  assert.equal(reconcileMemberCatalogue([],[{code:'jobs',logoUrl:'/jobs.png'}])[0].image,'/jobs.png');
  assert.equal(reconcileMemberCatalogue([],[{code:'funeral-cover'}],true,{funeralLogo:'/cover.png'})[0].image,'/cover.png');
});

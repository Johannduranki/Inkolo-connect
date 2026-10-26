import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from '../../frontend/node_modules/typescript/lib/typescript.js';
import {resolveCommunityConfiguration} from '../../frontend/public/tenant-service-policy.js';
import {reconcileMemberCatalogue} from '../../frontend/public/member-service-catalogue.js';
test('member catalogue source includes Loans without invented prices or working lending claims',()=>{
  const ast=ts.createSourceFile('dashboard.component.ts',fs.readFileSync(new URL('../../frontend/src/app/dashboard.component.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  let loan;
  function visit(node){if(ts.isArrayLiteralExpression(node)&&ts.isPropertyDeclaration(node.parent)&&node.parent.name.getText(ast)==='services')for(const obj of node.elements.filter(ts.isObjectLiteralExpression)){if(obj.properties.find(p=>p.name?.text==='code')?.initializer?.text==='loans')loan=obj;}ts.forEachChild(node,visit);}
  visit(ast);assert.ok(loan);assert.equal(loan.properties.find(p=>p.name?.text==='availability').initializer.text,'coming-soon');
  assert.equal(loan.properties.find(p=>p.name?.text==='plans').initializer.elements.length,0);
});

test('configured Loans remain unavailable and never acquire fabricated payment plans',()=>{
  for(const mode of ['free','paid','unconfigured']){
    const [loan]=reconcileMemberCatalogue([], [{code:'loans',name:'Loans',mode,amountCents:mode==='paid'?1000:0}]);
    assert.equal(loan.catalogueBlocked,true);
    assert.equal(loan.availability,'coming-soon');
    assert.deepEqual(loan.plans,[]);
    assert.match(loan.description,/applications, approvals and payouts are not connected/);
  }
});
test('Loans visibility requires enabling in both tenant and community',()=>{
  const community={id:'c',tenantId:'t',serviceCodes:['loans']};
  assert.deepEqual(resolveCommunityConfiguration({churchId:'c'},[community],[{id:'t',serviceCodes:['loans']}]).serviceCodes,['loans']);
  assert.deepEqual(resolveCommunityConfiguration({churchId:'c'},[community],[{id:'t',serviceCodes:[]}]).serviceCodes,[]);
  assert.deepEqual(resolveCommunityConfiguration({churchId:'c'},[{...community,serviceCodes:[]}],[{id:'t',serviceCodes:['loans']}]).serviceCodes,[]);
});

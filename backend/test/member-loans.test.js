import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from '../../frontend/node_modules/typescript/lib/typescript.js';
import {resolveCommunityConfiguration} from '../../frontend/public/tenant-service-policy.js';
test('deployed member catalogue includes Loans without invented prices or working lending claims',()=>{
  const ast=ts.createSourceFile('main.js',fs.readFileSync(new URL('../../frontend/dist/duranki-login/browser/main-4DAPJI7G.js',import.meta.url),'utf8'),99,true,1);
  let loan;
  function visit(node){if(ts.isArrayLiteralExpression(node)&&ts.isBinaryExpression(node.parent)&&node.parent.left.getText(ast)==='this.services')for(const obj of node.elements.filter(ts.isObjectLiteralExpression)){if(obj.properties.find(p=>p.name?.text==='code')?.initializer?.text==='loans')loan=obj;}ts.forEachChild(node,visit);}
  visit(ast);assert.ok(loan);assert.equal(loan.properties.find(p=>p.name?.text==='availability').initializer.text,'coming-soon');
  assert.equal(loan.properties.find(p=>p.name?.text==='plans').initializer.elements.length,0);
});
test('Loans visibility requires enabling in both tenant and community',()=>{
  const community={id:'c',tenantId:'t',serviceCodes:['loans']};
  assert.deepEqual(resolveCommunityConfiguration({churchId:'c'},[community],[{id:'t',serviceCodes:['loans']}]).serviceCodes,['loans']);
  assert.deepEqual(resolveCommunityConfiguration({churchId:'c'},[community],[{id:'t',serviceCodes:[]}]).serviceCodes,[]);
  assert.deepEqual(resolveCommunityConfiguration({churchId:'c'},[{...community,serviceCodes:[]}],[{id:'t',serviceCodes:['loans']}]).serviceCodes,[]);
});

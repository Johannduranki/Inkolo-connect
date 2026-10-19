import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from '../../frontend/node_modules/typescript/lib/typescript.js';

test('Angular registration submits all fields, consent and the actual file',()=>{
  const source=readFileSync(new URL('../../frontend/src/app/auth.service.ts',import.meta.url),'utf8');
  const ast=ts.createSourceFile('auth.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  let method;
  function visit(node){if(ts.isMethodDeclaration(node)&&node.name.getText(ast)==='register')method=node.getText(ast);ts.forEachChild(node,visit);}visit(ast);
  const code=ts.transpileModule('({'+method+'})',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const register=vm.runInNewContext(code,{FormData,tap:fn=>fn}).register;
  let submitted;
  const context={apiUrl:'/api',http:{post:(url,body)=>{assert.equal(url,'/api/auth/register');submitted=body;return {pipe(){}};}}};
  const file=new File(['synthetic'],'test.pdf',{type:'application/pdf'});
  register.call(context,'0600000111','Test','Member','synthetic-password',{idNumber:'9001015009087',dateOfBirth:'1990-01-01',gender:'Female',privacyAccepted:true,idDocument:file});
  for(const [key,value] of Object.entries({telephoneNumber:'0600000111',firstName:'Test',lastName:'Member',idNumber:'9001015009087',dateOfBirth:'1990-01-01',gender:'Female',privacyAccepted:'true'}))assert.equal(submitted.get(key),value);
  assert.equal(submitted.get('idDocument').size,file.size);
});

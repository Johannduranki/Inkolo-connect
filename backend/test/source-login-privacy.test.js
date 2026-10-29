import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from '../../frontend/node_modules/typescript/lib/typescript.js';
const source=readFileSync(new URL('../../frontend/src/app/login.component.ts',import.meta.url),'utf8');
const template=readFileSync(new URL('../../frontend/src/app/login.component.html',import.meta.url),'utf8');
const ast=ts.createSourceFile('login.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
let submit;
function visit(node){if(ts.isMethodDeclaration(node)&&node.name.getText(ast)==='submit')submit=node.getText(ast);ts.forEachChild(node,visit);}visit(ast);
const code=ts.transpileModule('class Screen {'+submit+'}',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function run(mode,mfaRequired=false){
  const calls=[];
  const loading=()=>false;loading.set=()=>{};
  const control=(value,invalid=false)=>({value,invalid,markAsTouched(){}});
  const screen={mode:()=>mode,existingAccount:()=>false,privacyAccepted:control(false,true),idNumber:control(''),gender:control(''),idOcrBusy:()=>false,loading,errorMessage:{set(){}},firstName:control('',true),lastName:control('',true),
    address:control(''),city:control(''),region:control(''),country:control(''),postalCode:control(''),
    telephoneNumber:control('0000001004'),password:control('synthetic-password'),completeLogin:()=>calls.push('complete'),
    auth:{login:()=>{calls.push('login');return {pipe:()=>({subscribe:handlers=>handlers.next({user:{},mfaRequired})})};},register:()=>{calls.push('register');}}};
  const fn=vm.runInNewContext(code+';Screen.prototype.submit',{sessionStorage:{getItem:()=>null},finalize:fn=>fn,window:{location:{assign:url=>calls.push(url)}}});
  fn.call(screen);return calls;
}
test('source login has no account picker or hardcoded demo-user list',()=>{
  assert.doesNotMatch(source,/demoUsers|chooseDemoUser|DemoLoginUser/);
  assert.doesNotMatch(template,/demo-user-picker|Choose a registered user/);
  assert.match(template,/@if \(mode\(\) === 'register' && !existingAccount\(\)\) \{\s*<section class="identity-panel"/);
});
test('returning users can sign in without resubmitting personal details',()=>{
  assert.deepEqual(run('login'),['login','complete']);assert.deepEqual(run('register'),[]);
});
test('source login sends privileged challenges to MFA instead of loading a dashboard',()=>{
  assert.deepEqual(run('login',true),['login','/two-factor']);
});

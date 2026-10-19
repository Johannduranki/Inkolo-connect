import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../../frontend/node_modules/typescript/lib/typescript.js';

const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const bundle=fs.readFileSync(new URL('../../frontend/dist/duranki-login/browser/main-4DAPJI7G.js',import.meta.url),'utf8');
const ast=ts.createSourceFile('main.js',bundle,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const methods={};
function visit(node){if(ts.isMethodDeclaration(node)){const name=node.name.getText(ast),text=node.getText(ast);if(name==='login'&&text.includes('/auth/login'))methods.login=text;if(name==='submit'&&text.includes('this.auth.login'))methods.submit=text;}ts.forEachChild(node,visit);}visit(ast);

test('deployed auth stores MFA challenge separately and never treats it as an authenticated session',()=>{
  const sessionStorage=storage(),localStorage=storage();let saved=null;
  sessionStorage.setItem('duranki_access_token','old-session');localStorage.setItem('duranki_access_token','old-session');
  const login=vm.runInNewContext('({'+methods.login+'}).login',{sessionStorage,localStorage,rt:callback=>callback});
  const response={mfaRequired:true,accessToken:'test-challenge'};
  const auth={apiUrl:'/api',tokenKey:'duranki_access_token',inMemoryToken:'old-session',http:{post:()=>({pipe:callback=>callback(response)})},storeToken:token=>saved=token};
  login.call(auth,'fixture','fixture');
  assert.equal(sessionStorage.getItem('duranki_mfa_challenge'),'test-challenge');
  assert.equal(sessionStorage.getItem('duranki_access_token'),null);assert.equal(localStorage.getItem('duranki_access_token'),null);assert.equal(auth.inMemoryToken,null);assert.equal(saved,null);
  response.mfaRequired=false;response.accessToken='member-session';login.call(auth,'fixture','fixture');
  assert.equal(saved,'member-session');assert.equal(sessionStorage.getItem('duranki_mfa_challenge'),null);
});

test('deployed login redirects challenge responses without requesting protected dashboard data',()=>{
  let redirected,completed=false;
  const submit=vm.runInNewContext('({'+methods.submit+'}).submit',{window:{location:{replace:url=>redirected=url}},En:fn=>fn});
  const loading=()=>false;loading.set=()=>{};
  const control={value:'fixture',invalid:false,markAsTouched(){}};
  const context={errorMessage:{set(){}},registrationNotice:{set(){}},telephoneNumber:control,password:control,loading,mode:()=> 'login',auth:{login:()=>({pipe:()=>({subscribe:handlers=>handlers.next({mfaRequired:true,user:{}})})})},completeLogin:()=>completed=true};
  submit.call(context);assert.equal(redirected,'/two-factor');assert.equal(completed,false);
});

test('late status response cannot erase a new challenge or send it back to login',async()=>{
  const sessionStorage=storage(),localStorage=storage();sessionStorage.setItem('duranki_access_token','old-session');
  let resolveResponse,redirected;
  vm.runInNewContext(fs.readFileSync(new URL('../../frontend/public/mfa-navigation.js',import.meta.url),'utf8'),{sessionStorage,localStorage,location:{pathname:'/login',replace:url=>redirected=url},setInterval(){},fetch:()=>new Promise(resolve=>resolveResponse=resolve)});
  sessionStorage.removeItem('duranki_access_token');sessionStorage.setItem('duranki_mfa_challenge','new-challenge');
  resolveResponse({ok:true,json:async()=>({required:true,verified:false})});await tick();
  assert.equal(sessionStorage.getItem('duranki_mfa_challenge'),'new-challenge');assert.equal(redirected,undefined);
});

test('authenticator page shows the enrolled code form and completes only after server verification',async()=>{
  const sessionStorage=storage(),localStorage=storage();sessionStorage.setItem('duranki_mfa_challenge','test-challenge');
  const nodes=new Map();const document={querySelector:key=>{if(!nodes.has(key))nodes.set(key,{hidden:true,value:'',textContent:'',dataset:{},focus(){this.focused=true;},setAttribute(){},removeAttribute(){}});return nodes.get(key);}};
  let redirected;const requests=[];
  vm.runInNewContext(fs.readFileSync(new URL('../../frontend/public/two-factor.js',import.meta.url),'utf8'),{document,sessionStorage,localStorage,location:{replace:url=>redirected=url},fetch:async(path,options)=>{requests.push({path,options});return {ok:true,json:async()=>path.endsWith('/status')?{challenge:true,enrolled:true}:{accessToken:'verified-session',destination:'/dashboard/platform-admin',recoveryCodes:[]}};}});
  await tick();
  assert.equal(nodes.get('#security-panel').hidden,false);assert.equal(nodes.get('#setup-panel').hidden,true);assert.equal(nodes.get('#code').focused,true);
  assert.equal(requests[0].options.headers.Authorization,'Bearer test-challenge');assert.equal(redirected,undefined);
  nodes.get('#code').value='123456';nodes.get('#verify-form').onsubmit({preventDefault(){}});await tick();
  assert.equal(redirected,'/dashboard/platform-admin');assert.equal(sessionStorage.getItem('duranki_access_token'),'verified-session');assert.equal(sessionStorage.getItem('duranki_mfa_challenge'),null);
});

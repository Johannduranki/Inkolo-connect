import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('existing-account handoff changes actual form mode without submitting or replacing details',()=>{
  const source=readFileSync(new URL('../../frontend/public/community-registration-link.js',import.meta.url),'utf8');
  const start=source.indexOf('  function useExistingAccount(input) {');
  const end=source.indexOf('  function existingLoginNotice()',start);
  let mode='register',focused=false;const saved={};
  const context={normalize:v=>v,sessionStorage:{setItem:(k,v)=>saved[k]=v},document:{
    querySelectorAll:()=>[{textContent:'Member login',click:()=>mode='login'}],
    querySelector:()=>({focus:()=>focused=true})},location:{assign:()=>assert.fail('Should use existing login form')}};
  vm.runInNewContext('let existingLoginPhone="";'+source.slice(start,end)+';useExistingAccount({value:"0601234567"});',context);
  assert.equal(mode,'login');assert.equal(focused,true);assert.equal(saved.duranki_join_after_login,'true');
  assert.match(source,/if\(data\.registered\)\{registeredPhone=phone;useExistingAccount\(input\);\}/);
});

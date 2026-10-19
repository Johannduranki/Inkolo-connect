import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../frontend/public/mfa-navigation.js',import.meta.url),'utf8');
async function scenario(roles,pending,challenge=false){
  const session=new Map([['duranki_access_token','synthetic']]);
  if(pending)session.set('duranki_login_landing_pending','1');
  const local=new Map(), redirects=[];
  const storage=m=>({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)});
  vm.runInNewContext(source,{document:{addEventListener(){}},location:{pathname:'/dashboard/member',replace:p=>redirects.push(p)},sessionStorage:storage(session),localStorage:storage(local),setInterval(){},Date,fetch:async url=>({ok:true,status:200,json:async()=>url.endsWith('/status')?{required:true,verified:!challenge,challenge}:{id:42,roles}})});
  await new Promise(resolve=>setImmediate(resolve));
  return {session,local,redirects};
}
test('fresh platform login overrides saved member landing',async()=>{const r=await scenario(['Member','Platform Admin'],true);assert.deepEqual(r.redirects,['/dashboard/platform-admin']);assert.equal(r.local.get('duranki_active_role_42'),'Platform Admin');assert.equal(r.session.has('duranki_login_landing_pending'),false);});
test('deliberate member role remains after login is complete',async()=>{assert.deepEqual((await scenario(['Member','Platform Admin'],false)).redirects,[]);});
test('ordinary members are not redirected to platform administration',async()=>{assert.deepEqual((await scenario(['Member'],true)).redirects,[]);});
test('MFA challenge must complete before admin landing',async()=>{assert.deepEqual((await scenario(['Platform Admin'],true,true)).redirects,['/two-factor']);});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../../frontend/public/two-factor.js',import.meta.url),'utf8');
const complete=source.slice(source.indexOf('async function complete()'),source.indexOf("$('#setup').onclick"));
async function landing(destination,community,join=false,failed=false){
 const values=new Map(join?[['duranki_join_after_login','true']]:[]),visits=[];
 const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 const context=vm.createContext({destination,verifiedToken:'synthetic-token',sessionStorage:storage,localStorage:storage,encodeURIComponent,location:{replace:url=>visits.push(url)},fetch:async()=>{if(failed)throw Error('offline');return {ok:true,json:async()=>community};}});
 await vm.runInContext(complete+'\ncomplete()',context);return visits;
}
test('MFA member landing preserves the registered community scope',async()=>assert.deepEqual(await landing('/dashboard/member',{churchId:'community/a'}),['/community?communityId=community%2Fa']));
test('MFA admin destination and explicit community joining remain unchanged',async()=>{
 assert.deepEqual(await landing('/dashboard/platform-admin',{churchId:'member-community'}),['/dashboard/platform-admin']);
 assert.deepEqual(await landing('/dashboard/member',{churchId:'member-community'},true),['/join-community']);
});
test('members without a community or with a failed lookup retain a usable dashboard',async()=>{
 assert.deepEqual(await landing('/dashboard/member',null),['/dashboard/member']);
 assert.deepEqual(await landing('/dashboard/member',null,false,true),['/dashboard/member']);
});
test('password login uses authenticated membership rather than the legacy subscription flag',()=>{
 const login=readFileSync(new URL('../../frontend/src/app/login.component.ts',import.meta.url),'utf8').split('private completeLogin')[1];
 assert.match(login,/getMemberCommunity\(String\(user.id\)\)/);assert.match(login,/communityId: community.churchId/);assert.doesNotMatch(login,/getSubscriptions/);
});

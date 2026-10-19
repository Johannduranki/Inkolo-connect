import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from '../../frontend/node_modules/typescript/lib/typescript.js';
import rx from '../../frontend/node_modules/rxjs/dist/cjs/index.js';

const source = readFileSync(new URL('../../frontend/src/app/core/services/role.service.ts',import.meta.url),'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function load(source, injections, modules = {}, storage = new Map()) {
  const exports = {};
  const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText;
  vm.runInNewContext(compiled,{exports,require: name => {
    if (name === '@angular/core') return {Injectable:()=>c=>c,inject:key=>injections[key]};
    if (name === '@angular/common/http') return {HttpClient:'http'};
    if (name === '@angular/router') return {Router:'router'};
    if (name === 'rxjs') return rx;
    if (modules[name]) return modules[name];
    throw Error('Unexpected import '+name);
  },localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},console});
  return exports;
}
function harness() {
  const requests = [], storage = new Map([['duranki_current_user_id','6'],['duranki_role_assignments','{"6":["Platform Admin"]}']]);
  const http = Object.fromEntries(['get','put','post','delete'].map(method=>[method,(url,body)=>{
    const response = new rx.Subject(); requests.push({method,url,body,response}); return response;
  }]));
  const {RoleService} = load(source,{http},{},storage);
  return {roles:new RoleService(),requests,storage};
}
test('source roles start empty despite forged cached assignments and no demo members are seeded',()=>{
  const {roles} = harness();
  let current; roles.getUserRoles().subscribe(v=>current=v);
  assert.deepEqual(plain(current),[]); assert.equal(roles.canAccessRole('Platform Admin'),false);
  let members; roles.getCommunityMembers().subscribe(v=>members=v); assert.deepEqual(plain(members),[]);
  assert.doesNotMatch(source,/defaultAssignments|rolesForUser|readRoleAssignments/);
});
test('source initializes only server roles and ignores a stored role outside that assignment',()=>{
  const {roles,storage} = harness(); storage.set('duranki_active_role_91004','Platform Admin');
  roles.initializeUser(91004,['Member']); assert.equal(roles.getActiveRole(),'Member');
  assert.equal(roles.setActiveRole('Platform Admin'),false);
  roles.initializeUser(91001,['Platform Admin','Member']); assert.equal(roles.setActiveRole('Platform Admin'),true);
  assert.equal(roles.getDashboardRouteForRole('Platform Admin'),'/dashboard/platform-admin');
  assert.equal(roles.getDashboardRouteForRole('Tenant Staff'),'/dashboard/tenant');
});
test('failed role updates cannot change the member or current session roles',()=>{
  const {roles,requests} = harness(); roles.initializeUser(91004,['Member']);
  let members; roles.getCommunityMembers().subscribe(v=>members=v);
  requests[0].response.next([{id:91004,roles:['Member']}]);
  roles.setMemberRoles(91004,['Platform Admin']);
  assert.deepEqual(plain(members[0].roles),['Member']); assert.equal(roles.canAccessRole('Platform Admin'),false);
  requests[1].response.error({status:403});
  assert.deepEqual(plain(members[0].roles),['Member']); assert.equal(roles.canAccessRole('Platform Admin'),false);
  assert.match(roles.roleUpdateErrorSubject.value,/not saved/);
});
test('successful role updates use returned server roles rather than submitted roles',()=>{
  const {roles,requests} = harness(); roles.initializeUser(91001,['Platform Admin']);
  let members; roles.getCommunityMembers().subscribe(v=>members=v);
  requests[0].response.next([{id:91004,roles:['Member']}]);
  roles.setMemberRoles(91004,['Service Provider User']); requests[1].response.next({roles:['Member','Service Provider User']});
  assert.deepEqual(plain(members[0].roles),['Member','Service Provider User']);
  assert.equal(roles.canAccessRole('Platform Admin'),true);
});
test('late directory and role-update responses cannot cross a logout or user switch',()=>{
  const {roles,requests} = harness(); roles.initializeUser(91001,['Platform Admin']);
  let members; roles.getCommunityMembers().subscribe(v=>members=v);
  roles.setMemberRoles(91004,['Service Provider User']); roles.clearUser(); roles.initializeUser(91005,['Member']);
  requests[0].response.next([{id:91004,roles:['Platform Admin']}]); requests[1].response.next({roles:['Platform Admin']});
  assert.deepEqual(plain(members),[]); assert.equal(roles.canAccessRole('Platform Admin'),false);
});
test('a stale directory response cannot repopulate records after a newer access denial',()=>{
  const {roles,requests} = harness(); roles.initializeUser(91001,['Platform Admin']);
  let members; roles.getCommunityMembers().subscribe(v=>members=v); roles.getCommunityMembers();
  requests[1].response.error({status:403}); requests[0].response.next([{id:91004,roles:['Member']}]);
  assert.deepEqual(plain(members),[]);
});
for (const file of ['auth.guard.ts','role.guard.ts']) {
  test(`${file}: validates current profile, fails closed, ignores superseded identity`, async()=>{
    const {roles} = harness(); let token='one'; let profile = new rx.Subject();
    const auth = {getToken:()=>token,getProfile:()=>profile};
    const exports = load(readFileSync(new URL('../../frontend/src/app/'+file,import.meta.url),'utf8'),
      {roles,auth,router:{createUrlTree:paths=>paths.join('')}},
      {'./auth.service':{AuthService:'auth'},'./core/services/role.service':{RoleService:'roles'}});
    const guard = exports[file.startsWith('auth')?'authGuard':'roleGuard'];
    let result; guard({data:{role:'Platform Admin'}}).subscribe(v=>result=v);
    profile.next({id:91004,roles:['Member'],firstName:'Test',lastName:'Member'});
    assert.equal(result,file.startsWith('auth')?true:'/dashboard/member');
    profile = new rx.Subject(); guard({data:{role:'Platform Admin'}}).subscribe(v=>result=v);
    token='two'; profile.next({id:91001,roles:['Platform Admin']});
    assert.equal(result,'/login'); assert.equal(roles.canAccessRole('Platform Admin'),false);
    profile = new rx.Subject(); guard({data:{role:'Platform Admin'}}).subscribe(v=>result=v);
    profile.error({status:401}); assert.equal(result,'/login'); assert.equal(roles.canAccessRole('Member'),false);
  });
}
test('source role guard does not loop an account with no Member role back to the member route',()=>{
  const {roles} = harness(), profile = new rx.Subject();
  const {roleGuard} = load(readFileSync(new URL('../../frontend/src/app/role.guard.ts',import.meta.url),'utf8'),
    {roles,auth:{getToken:()=> 'test',getProfile:()=>profile},router:{createUrlTree:paths=>paths.join('')}},
    {'./auth.service':{AuthService:'auth'},'./core/services/role.service':{RoleService:'roles'}});
  let result; roleGuard({data:{role:'Member'}}).subscribe(v=>result=v);
  profile.next({id:91007,roles:['Service Provider User']}); assert.equal(result,'/login');
});
test('source login does not infer administrative access from a name or numeric account ID',()=>{
  const login=readFileSync(new URL('../../frontend/src/app/login.component.ts',import.meta.url),'utf8');
  assert.doesNotMatch(login,/isVumaAdmin|user\.id === 19/);
  assert.match(login,/window\.location\.assign\(this\.roles\.getDashboardRouteForRole\(activeRole\)\)/);
});

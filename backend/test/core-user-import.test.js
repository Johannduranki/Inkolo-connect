import test from 'node:test';
import assert from 'node:assert/strict';
import { hash } from 'bcryptjs';
import { buildCoreImport } from '../src/core-user-import.js';
import { verifyImportedPassword } from '../src/imported-password.js';

const original=()=>({users:[{id:1,telephoneNumber:'0712345678',email:'demo@example.local'},
  {id:21,telephoneNumber:'0821111111',firstName:'Existing',roles:['Member']},
  {id:1000001,telephoneNumber:'0000000001',firstName:'Synthetic',lastName:'Admin',status:'active',roles:['Platform Admin','Member']}],churches:[],memberCommunities:[],profiles:[]});
const user=(id,phone,community_id)=>({id,phone_number:phone,community_id,status:'active',first_name:'Test',last_name:'Member',password:'preserved-hash'});

test('import never provisions an administrator from a phone number',()=>{
  const state=original();
  state.users=state.users.filter(u=>!u.roles?.includes('Platform Admin'));
  assert.throws(()=>buildCoreImport(state,{users:[],members:[],user_role:[]}),/Provision exactly one/);
});
test('preserves local users and superuser; maps source memberships without granting roles',()=>{
  const source={users:[user(506,'0000000001',2),user(10,'0822222222',2)],members:[{user_id:10,community_id:1}],user_role:[{user_id:10,role_id:1}]};
  const {state,report}=buildCoreImport(original(),source);
  assert.deepEqual(report.removedDemoIds,['1']);
  assert.ok(state.users.some(u=>u.id===21));
  const admin=state.users.find(u=>u.id===1000001);
  assert.equal(admin.passwordHash,undefined);
  assert.ok(admin.roles.includes('Platform Admin'));
  assert.deepEqual(state.users.find(u=>u.id===2000010).roles,['Member']);
  assert.deepEqual(state.memberCommunities.filter(m=>m.memberId==='2000010').map(m=>[m.tenantId,m.communityId]),[
    ['tenant-inkolo','trader-ilembe'],['tenant-zuc','community-zuc']]);
  assert.equal(state.demoUsersDisabled,true);
  const again=buildCoreImport(state,source).state;
  assert.equal(again.users.length,state.users.length);
  assert.deepEqual(again.memberCommunities,state.memberCommunities);
});
test('duplicate phones and unmapped communities fail closed without losing accounts',()=>{
  const source={users:[user(10,'0822222222',2),user(11,'+27822222222',1),user(12,'0833333333',17)],members:[],user_role:[]};
  const {state,report}=buildCoreImport(original(),source);
  assert.equal(report.importedInactiveMembers,3);
  assert.equal(state.users.filter(u=>u.importSource==='duranki-core').length,3);
  assert.ok(report.review.some(r=>r.reason==='unmapped_source_community'));
});
test('source bcrypt credentials require the original password',async()=>{
  const encoded=await hash('Synthetic-test-only-839!',4);
  assert.equal(await verifyImportedPassword('Synthetic-test-only-839!',encoded),true);
  assert.equal(await verifyImportedPassword('wrong',encoded),false);
  assert.equal(await verifyImportedPassword('',encoded),false);
  assert.equal(await verifyImportedPassword('anything','invalid'),false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {communityMembershipAccess} from '../src/member-access.js';

test('active platform administrators retain testing access regardless of chosen member view',()=>{
  for(const role of ['Platform Admin','DURANKI_ADMIN']){
    const user={status:'active',roles:['Member',role],membership_type:null};
    assert.deepEqual(communityMembershipAccess(user),{exempt:true,reason:'platform_admin_testing',scope:'all_communities'});
    assert.equal(user.membership_type,null);
  }
});
test('members, tenant/community admins, disabled and absent accounts are not exempt',()=>{
  for(const user of [null,{}, {status:'active',roles:['Member']},{status:'active',roles:['Tenant Admin']},{status:'active',roles:['Community Admin']},{status:'inactive',roles:['Platform Admin']}]){
    assert.equal(communityMembershipAccess(user).exempt,false);
  }
});

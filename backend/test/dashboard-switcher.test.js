import test from 'node:test';
import assert from 'node:assert/strict';
import { destinationValue, synchronizeSwitcher, scopedMemberLink } from '../../frontend/public/dashboard-switcher.js';
const values=['__community:trader-ilembe','__community:community-zuc','Platform Admin','Accountant'];

test('member links retain exact scope without leaking it to external or admin destinations',()=>{
  const current='https://duranki.test/community?communityId=community-zuc';
  assert.equal(scopedMemberLink('/dashboard/member?from=community&service=wallet',current),'https://duranki.test/dashboard/member?from=community&service=wallet&communityId=community-zuc');
  assert.equal(scopedMemberLink('/community?communityId=trader-ilembe',current),'https://duranki.test/community?communityId=trader-ilembe');
  assert.equal(scopedMemberLink('/dashboard',current),'https://duranki.test/dashboard/member?communityId=community-zuc');
  assert.equal(scopedMemberLink('/dashboard/accounting',current),'https://duranki.test/dashboard/accounting');
  assert.equal(scopedMemberLink('https://other.test/community',current),'https://other.test/community');
  assert.equal(scopedMemberLink('/community','https://duranki.test/login'),'https://duranki.test/community');
});
test('switcher follows the loaded community, not the first membership',()=>{
  const select={value:values[0],options:values.map(value=>({value}))};
  synchronizeSwitcher(select,{pathname:'/community',search:'?communityId=community-zuc'});
  assert.equal(select.value,'__community:community-zuc');
  synchronizeSwitcher(select,{pathname:'/community',search:'?communityId=trader-ilembe'});
  assert.equal(select.value,'__community:trader-ilembe');
});
test('exact IDs and dashboard routes resolve without guessing another community',()=>{
  assert.equal(destinationValue('/community','?communityId=community-zuc-2',values),'');
  assert.equal(destinationValue('/dashboard/accounting','',values),'Accountant');
  assert.equal(destinationValue('/dashboard/platform-admin','',values),'Platform Admin');
  assert.equal(destinationValue('/dashboard/member','?service=wallet&communityId=community-zuc',values),'__community:community-zuc');
});

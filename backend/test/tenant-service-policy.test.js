import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCommunityConfiguration as resolve } from '../../frontend/public/tenant-service-policy.js';
const communities=[{id:'community-ilembe-traders',tenantId:'trader',serviceCodes:['wallet','trader-training'],status:'Active'},{id:'zuc',tenantId:'zuc',serviceCodes:['funeral-cover'],status:'Active'}];
const tenants=[{id:'trader',serviceCodes:['wallet'],status:'Active'},{id:'zuc',serviceCodes:['funeral-cover'],status:'Active'}];
test('legacy ride name and deliveries setting resolve to the same enabled service',()=>{
  const member={churchId:'rides'};
  const c=[{id:'rides',tenantId:'trader',serviceCodes:['catch-a-ride']}];
  assert.deepEqual(resolve(member,c,[{id:'trader',serviceCodes:['deliveries']}]).serviceCodes,['catch-a-ride']);
  assert.deepEqual(resolve(member,c,[{id:'trader',serviceCodes:[]}]).serviceCodes,[]);
});
test('member alias resolves to correct tenant and uses intersection',()=>{
  assert.deepEqual(resolve({churchId:'trader-ilembe'},communities,tenants).serviceCodes,['wallet']);
  assert.deepEqual(resolve({churchId:'zuc'},communities,tenants).serviceCodes,['funeral-cover']);
});
test('tenant service changes are reflected without rewriting community choices',()=>{
  assert.deepEqual(resolve({churchId:'trader-ilembe'},communities,[{...tenants[0],serviceCodes:['trader-training']}]).serviceCodes,['trader-training']);
  assert.deepEqual(communities[0].serviceCodes,['wallet','trader-training']);
});
test('missing, foreign and disabled configurations never enable services',()=>{
  assert.equal(resolve({churchId:'missing',churchName:'Traders KZN'},communities,tenants),null);
  assert.deepEqual(resolve({churchId:'trader-ilembe'},communities,[]).serviceCodes,[]);
  assert.deepEqual(resolve({churchId:'zuc'},communities,[{...tenants[1],status:'Inactive'}]).serviceCodes,[]);
  assert.deepEqual(resolve({churchId:'zuc'},[{...communities[1],status:'Inactive'}],tenants).serviceCodes,[]);
});

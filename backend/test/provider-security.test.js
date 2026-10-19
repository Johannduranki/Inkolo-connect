import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessProviderDocument, providerUploadScope, saveProviderGrant } from '../src/provider-security.js';
const fixture = () => ({ users: [
  { id: 'admin', status: 'active', roles: ['Platform Admin'] },
  { id: 'provider', status: 'active', roles: ['Service Provider User'] },
  { id: 'member-a', status: 'active', roles: ['Member'] },
  { id: 'member-b', status: 'active', roles: ['Member'] }
], importedCommunities: [
  { id: 'a', name: 'A', tenantId: 'tenant-a', tenantName: 'A' },
  { id: 'b', name: 'B', tenantId: 'tenant-b', tenantName: 'B' }
], memberCommunities: [
  { memberId: 'member-a', communityId: 'a', tenantId: 'tenant-a' },
  { memberId: 'member-b', communityId: 'b', tenantId: 'tenant-b' }
] });
const grant = { userId: 'provider', serviceProviderId: 'provider-one', tenantId: 'tenant-a', communityId: 'a', serviceCodes: ['funeral-cover'], status: 'active' };

test('provider grants require platform admin, real scope and allowlisted fields', () => {
  const state = fixture();
  assert.throws(() => saveProviderGrant(state, state.users[1], grant), { status: 403 });
  assert.throws(() => saveProviderGrant(state, state.users[0], { ...grant, communityId: 'b' }), { status: 400 });
  assert.throws(() => saveProviderGrant(state, state.users[0], { ...grant, roles: ['Platform Admin'] }), { status: 400 });
  saveProviderGrant(state, state.users[0], grant);
  assert.equal(state.providerAccessGrants.length, 1);
  assert.equal(state.securityAudit.length, 1);
});

test('provider document access rejects changed provider, tenant, community and service IDs', () => {
  const state = fixture();
  saveProviderGrant(state, state.users[0], grant);
  const doc = { serviceProviderId: 'provider-one', tenantId: 'tenant-a', communityId: 'a', serviceId: 'funeral-cover-001' };
  assert.equal(canAccessProviderDocument(state, state.users[1], doc), true);
  for (const change of [{ tenantId: 'tenant-b' }, { communityId: 'b' }, { serviceProviderId: 'provider-two' }, { serviceId: 'wallet' }, { tenantId: undefined }]) assert.equal(canAccessProviderDocument(state, state.users[1], { ...doc, ...change }), false);
  saveProviderGrant(state, state.users[0], { ...grant, status: 'revoked' });
  assert.equal(canAccessProviderDocument(state, state.users[1], doc), false);
});

test('provider uploads require member membership in the granted community', () => {
  const state = fixture();
  saveProviderGrant(state, state.users[0], grant);
  const request = { memberId: 'member-a', serviceId: 'funeral-cover-001', serviceProviderId: 'provider-one' };
  assert.equal(providerUploadScope(state, state.users[1], request).tenantId, 'tenant-a');
  assert.throws(() => providerUploadScope(state, state.users[1], { ...request, memberId: 'member-b' }), { status: 403 });
  assert.throws(() => providerUploadScope(state, state.users[1], { ...request, tenantId: 'tenant-b' }), { status: 403 });
});

test('a stale administrator snapshot cannot provision provider access after revocation',()=>{
  const state=fixture(),stale=structuredClone(state.users[0]);state.users[0].roles=['Member'];
  assert.throws(()=>saveProviderGrant(state,stale,grant),{status:403});assert.equal(state.providerAccessGrants,undefined);
});

for (const actorIndex of [0, 1]) {
  test(`provider document reads and uploads reject stale actor ${actorIndex}`, () => {
    for (const change of [user => { user.status = 'inactive'; }, user => { user.roles = ['Member']; }]) {
      const state = fixture();
      saveProviderGrant(state, state.users[0], grant);
      const stale = structuredClone(state.users[actorIndex]);
      const request = { memberId: 'member-a', serviceId: 'funeral-cover-001', serviceProviderId: 'provider-one', tenantId: 'tenant-a', communityId: 'a' };
      change(state.users[actorIndex]);
      assert.equal(canAccessProviderDocument(state, stale, request), false);
      assert.throws(() => providerUploadScope(state, stale, request), { status: 403 });
    }
  });
}

test('provider scope stops following a community after reparenting or deactivation', () => {
  for (const change of [community => { community.tenantId = 'tenant-b'; }, community => { community.status = 'inactive'; }]) {
    const state = fixture();
    saveProviderGrant(state, state.users[0], grant);
    const request = { memberId: 'member-a', serviceId: 'funeral-cover-001', serviceProviderId: 'provider-one', tenantId: 'tenant-a', communityId: 'a' };
    change(state.importedCommunities[0]);
    assert.equal(canAccessProviderDocument(state, state.users[1], request), false);
    assert.throws(() => providerUploadScope(state, state.users[1], request), { status: 403 });
    assert.equal(state.providerAccessGrants.length, 1);
  }
});

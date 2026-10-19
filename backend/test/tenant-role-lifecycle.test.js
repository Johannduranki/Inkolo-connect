import test from 'node:test';
import assert from 'node:assert/strict';
import { saveTenantStaff, permissionsFor } from '../src/tenant-access.js';

function fixture() {
  return {
    users: [
      { id: 1, status: 'active', roles: ['Platform Admin'] },
      { id: 2, status: 'active', roles: ['Member', 'Tenant Staff', 'Service Provider User'], passwordHash: 'unchanged-test-hash' }
    ],
    tenantAccessDirectory: [{ id: 'tenant-a' }, { id: 'tenant-b' }],
    tenantStaff: [{ id: 'a', userId: '2', tenantId: 'tenant-a', status: 'active', permissions: ['tenant.view'] }],
    providerAccessGrants: [{ id: 'provider-a', userId: '2', status: 'active' }]
  };
}
const change = (state, id, tenantId, status) => saveTenantStaff(state, state.users[0], tenantId, { status, permissions: ['tenant.view'] }, id);

test('last tenant revocation removes only Tenant Staff while preserving credentials and provider grants', () => {
  const state = fixture(), grants = structuredClone(state.providerAccessGrants);
  change(state, 'a', 'tenant-a', 'revoked');
  assert.deepEqual(state.users[1].roles, ['Member', 'Service Provider User']);
  assert.equal(state.users[1].passwordHash, 'unchanged-test-hash');
  assert.deepEqual(state.providerAccessGrants, grants);
  assert.equal(state.tenantStaff.length, 1);
  assert.deepEqual(permissionsFor(state, state.users[1], 'tenant-a'), []);
  assert.equal(state.tenantAccessAudit[0].status, 'revoked');
});
test('revoking one tenant retains the role and access for another active assignment', () => {
  const state = fixture();
  state.tenantStaff.push({ id: 'b', userId: '2', tenantId: 'tenant-b', status: 'active', permissions: ['tenant.view'] });
  change(state, 'a', 'tenant-a', 'revoked');
  assert(state.users[1].roles.includes('Tenant Staff'));
  assert.deepEqual(permissionsFor(state, state.users[1], 'tenant-b'), ['tenant.view']);
  change(state, 'b', 'tenant-b', 'revoked');
  assert(!state.users[1].roles.includes('Tenant Staff'));
});
test('reactivation restores one navigation role and retains unrelated roles', () => {
  const state = fixture();
  change(state, 'a', 'tenant-a', 'revoked');
  change(state, 'a', 'tenant-a', 'active');
  change(state, 'a', 'tenant-a', 'active');
  assert.equal(state.users[1].roles.filter(role => role === 'Tenant Staff').length, 1);
  assert(state.users[1].roles.includes('Service Provider User'));
  assert.deepEqual(permissionsFor(state, state.users[1], 'tenant-a'), ['tenant.view']);
});
test('denied grant updates cannot change roles or assignments', () => {
  const state = fixture(), before = structuredClone(state);
  assert.throws(() => saveTenantStaff(state, state.users[1], 'tenant-a', { permissions: ['tenant.view'], status: 'revoked' }, 'a'), { status: 403 });
  assert.deepEqual(state, before);
});

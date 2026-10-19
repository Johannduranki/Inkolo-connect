import test from 'node:test';
import assert from 'node:assert/strict';
import { tenantOperation } from '../../frontend/public/tenant-operations.js';

test('tenant operations target existing sections and scoped workspaces', () => {
  for (const name of ['Tenant details', 'Tenant website', 'Enabled services', 'Communities', 'Settings']) {
    assert.ok(tenantOperation(name, 'tenant-a').section);
  }
  assert.equal(tenantOperation('Settings', 'tenant-a').edit, true);
  assert.equal(tenantOperation('Users', 'tenant-a').href, '/dashboard/tenant?tenantId=tenant-a');
  assert.equal(tenantOperation('Transactions', 'a&b').href, '/dashboard/cycle?tenantId=a%26b');
  assert.equal(tenantOperation('Reports', 'a&b').href, '/dashboard/community-reports?tenantId=a%26b');
});

test('unimplemented operations and missing tenant never open another workspace', () => {
  assert.ok(tenantOperation('Revenue', 'tenant-a').unavailable);
  assert.ok(tenantOperation('Users', null).unavailable);
});

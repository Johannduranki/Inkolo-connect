import test from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { verifyLocalAdminPassword } from '../src/local-admin-password.js';

test('local admin requires the correct password and a valid stored hash', () => {
  const salt = '1234567890abcdef1234567890abcdef';
  const encoded = `${salt}:${scryptSync('test-secret', salt, 64).toString('hex')}`;
  assert.equal(verifyLocalAdminPassword('test-secret', encoded), true);
  for (const password of ['wrong', '', undefined]) {
    assert.equal(verifyLocalAdminPassword(password, encoded), false);
  }
  assert.equal(verifyLocalAdminPassword('test-secret', undefined), false);
  assert.equal(verifyLocalAdminPassword('test-secret', 'invalid'), false);
});

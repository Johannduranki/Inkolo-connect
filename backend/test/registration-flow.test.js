import test from 'node:test';
import assert from 'node:assert/strict';
import { integrationEnvironment } from '../integration/http-harness.js';

// Registration behavior now lives in integration/mariadb-http.test.js.
const valid = { MARIADB_HTTP_TEST: '1', DB_HOST: '127.0.0.1', DB_PORT: '33306',
  DB_NAME: 'duranki_test_http', DB_USER: 'test', DB_PASSWORD: '',
  MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') };

test('HTTP integration refuses implicit or non-test database targets', () => {
  assert.throws(() => integrationEnvironment({}), /MARIADB_HTTP_TEST/);
  for (const DB_NAME of ['duranki', 'production', 'latest', 'test', 'test-prod;DROP DATABASE x']) {
    assert.throws(() => integrationEnvironment({ ...valid, DB_NAME }), /DB_NAME/);
  }
  assert.throws(() => integrationEnvironment({ ...valid, DB_HOST: 'app-dev.duranki.network' }), /DB_HOST/);
  assert.throws(() => integrationEnvironment({ ...valid, DB_PASSWORD: undefined }), /DB_PASSWORD/);
});

test('HTTP integration requires the bootstrap canonical base64 MFA key', () => {
  for (const MFA_ENCRYPTION_KEY of ['', 'abc', Buffer.alloc(31).toString('base64'), 'a'.repeat(64)]) {
    assert.throws(() => integrationEnvironment({ ...valid, MFA_ENCRYPTION_KEY }), /MFA_ENCRYPTION_KEY/);
  }
});

test('HTTP child receives only explicit test settings, never inherited app configuration', () => {
  const env = integrationEnvironment({ ...valid, LOCAL_ADMIN_PASSWORD_HASH: 'private',
    NODE_OPTIONS: '--require private.js', AUTH_STORAGE: 'other', JWT_SECRET: 'private' });
  assert.equal(env.AUTH_STORAGE, 'mariadb');
  assert.equal(env.LOCAL_ADMIN_PASSWORD_HASH, undefined);
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.notEqual(env.JWT_SECRET, 'private');
  assert.equal(env.MFA_ENCRYPTION_KEY, valid.MFA_ENCRYPTION_KEY);
});

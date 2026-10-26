import test from 'node:test';
import assert from 'node:assert/strict';
import { platformDigest } from '../src/mysql-platform-store.js';
import { selectAccountStorage } from '../src/account-storage.js';
import { platformStorage, readPlatformState } from '../src/platform-store.js';

function fixture({ missing = false, disabled = true, corrupt = false, rollbackError = false } = {}) {
  const bytes = Buffer.from(JSON.stringify({ users: [], demoUsersDisabled: disabled }));
  let released = false;
  return {
    pool: { getConnection: async () => ({
      beginTransaction: async () => {},
      rollback: async () => { if (rollbackError) throw Error('rollback failed'); },
      release: () => { released = true; },
      execute: async sql => sql.includes('SELECT *')
        ? [missing ? [] : [{ chunk_count: 1, byte_length: bytes.length, sha256: corrupt ? 'bad' : platformDigest(bytes), revision: 1 }]]
        : [[{ chunk_index: 0, payload: bytes }]]
    }) },
    released: () => released
  };
}

test('platform storage is always MariaDB and never reads local state before initialization', () => {
  assert.equal(platformStorage, 'mariadb');
  assert.throws(readPlatformState, { status: 503 });
});
test('canonical document selects MariaDB without detecting relational tables', async () => {
  const f = fixture(), env = {};
  assert.equal(await selectAccountStorage(f.pool, env), 'platform');
  assert.equal(f.released(), true);
  assert.equal(Object.keys(env).length, 6);
  assert.ok(Object.values(env).every(value => value === 'mariadb'));
  assert.equal(env.ALLOW_DEMO_AUTH, undefined);
});
test('missing, corrupt and demo-enabled documents fail closed without fallback', async () => {
  for (const options of [{ missing: true }, { corrupt: true }, { disabled: false }]) {
    const f = fixture(options), env = {};
    await assert.rejects(selectAccountStorage(f.pool, env));
    assert.equal(f.released(), true);
    assert.deepEqual(env, {});
  }
});
test('explicit non-MariaDB configuration is rejected before connecting', async () => {
  for (const feature of ['PLATFORM', 'AUTH', 'TREASURY', 'TRAINING', 'CYCLE', 'HERITAGE']) {
    const env = { [feature + '_STORAGE']: 'sqlite' };
    await assert.rejects(selectAccountStorage({}, env), { code: 'ACCOUNT_STORAGE_CONFLICT' });
    assert.equal(env[feature + '_STORAGE'], 'sqlite');
  }
});
test('database failures do not fall back and rollback failures still release', async () => {
  await assert.rejects(selectAccountStorage({ getConnection: async () => { throw Error('offline'); } }, {}), /offline/);
  const f = fixture({ rollbackError: true });
  await assert.rejects(selectAccountStorage(f.pool, {}), /rollback failed/);
  assert.equal(f.released(), true);
});

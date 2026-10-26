import test from 'node:test';
import assert from 'node:assert/strict';
import { provisionAdmin } from '../scripts/provision-admin.js';
import { emptyPlatformState } from '../scripts/bootstrap.js';
import { platformDigest } from '../src/mysql-platform-store.js';
import { needsMfa } from '../src/mfa.js';

const env = { MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') };
const request = { userId: '42', telephoneNumber: '0710000042', operator: 'test-operator', confirmed: true };
const hash = 'scrypt-v1:' + 'a'.repeat(32) + ':' + 'b'.repeat(128);
function fixture({ busy = false, version = '10.11-MariaDB', keyMismatch = false, failWrite = false } = {}) {
  const state = emptyPlatformState();
  state.users = [{ id: 42, telephoneNumber: request.telephoneNumber, passwordHash: hash, roles: ['Member'], status: 'active' }];
  state.profiles = [{ userId: 42 }];
  const db = { bytes: Buffer.from(JSON.stringify(state)), revision: 1, revoked: false, challengesDeleted: false };
  let snapshot, writes = 0, released = false;
  const connection = {
    beginTransaction: async () => { snapshot = { ...db }; },
    commit: async () => {},
    rollback: async () => { Object.assign(db, snapshot); },
    query: async sql => {
      if (sql.includes('VERSION()')) return [[{ version }]];
      if (sql.includes('DATABASE()')) return [[{ name: 'synthetic' }]];
      if (sql.includes('duranki_platform_migration')) return [[{ id: 1 }]];
      throw Error(sql);
    },
    execute: async (sql, params = []) => {
      if (sql.includes('GET_LOCK')) return [[{ acquired: busy ? 0 : 1 }]];
      if (sql.includes('RELEASE_LOCK')) { released = true; return [[]]; }
      if (sql.includes('SELECT key_sha256')) return [[{ key_sha256: keyMismatch ? 'bad' : platformDigest(Buffer.from(env.MFA_ENCRYPTION_KEY, 'base64')) }]];
      if (sql.startsWith('SELECT *')) return [[{ chunk_count: 1, byte_length: db.bytes.length, sha256: platformDigest(db.bytes), revision: db.revision }]];
      if (sql.startsWith('SELECT chunk_index')) return [[{ chunk_index: 0, payload: db.bytes }]];
      writes++;
      if (sql.startsWith('UPDATE duranki_auth_session')) db.revoked = true;
      else if (sql.startsWith('DELETE FROM duranki_mfa_challenge')) db.challengesDeleted = true;
      else if (sql.startsWith('UPDATE duranki_platform_document')) { if (failWrite) throw Error('synthetic write failure'); db.revision = params[0]; }
      else if (sql.startsWith('INSERT INTO duranki_platform_chunk')) db.bytes = Buffer.from(params[2]);
      else if (!sql.startsWith('DELETE FROM duranki_platform_chunk')) throw Error(sql);
      return [{ affectedRows: 1 }];
    }
  };
  return { connection, db, state: () => JSON.parse(db.bytes), change: fn => { const next = JSON.parse(db.bytes); fn(next); db.bytes = Buffer.from(JSON.stringify(next)); }, writes: () => writes, released: () => released };
}
test('explicit promotion preserves credentials, audits, revokes sessions and requires MFA', async () => {
  const f = fixture();
  assert.equal((await provisionAdmin(f.connection, request, env)).status, 'ADMIN_PROVISIONED');
  const state = f.state();
  assert.deepEqual(state.users[0].roles, ['Member', 'Platform Admin']);
  assert.equal(state.users[0].passwordHash, hash);
  assert.equal(state.users.length, 1);
  assert.equal(needsMfa(state.users[0]), true);
  assert.equal(state.securityAudit[0].operator, request.operator);
  assert.equal(JSON.stringify(state.securityAudit).includes(request.telephoneNumber), false);
  assert.equal(f.db.revoked, true);
  assert.equal(f.db.challengesDeleted, true);
  assert.equal(f.released(), true);
  const writes = f.writes();
  assert.equal((await provisionAdmin(f.connection, request, env)).status, 'ADMIN_ALREADY_PROVISIONED');
  assert.equal(f.writes(), writes);
});
test('unknown, inactive, duplicate, credentialless and mismatched accounts cannot be promoted', async () => {
  for (const change of [s => { s.users = []; }, s => { s.users[0].status = 'inactive'; },
    s => { s.users.push({ ...s.users[0] }); }, s => { s.users[0].passwordHash = ''; },
    s => { s.users[0].telephoneNumber = '0710000000'; }, s => { s.profiles = []; },
    s => { s.demoUsersDisabled = false; }]) {
    const f = fixture(); f.change(change);
    await assert.rejects(provisionAdmin(f.connection, request, env));
    assert.equal(f.writes(), 0);
    assert.equal(f.released(), true);
  }
});
test('requires explicit confirmation, MariaDB, stopped API and matching existing key', async () => {
  await assert.rejects(provisionAdmin({}, { ...request, confirmed: false }, env));
  for (const options of [{ version: '8.0-MySQL' }, { busy: true }, { keyMismatch: true }]) {
    const f = fixture(options);
    await assert.rejects(provisionAdmin(f.connection, request, env));
    assert.equal(f.writes(), 0);
  }
});
test('failed document write rolls back session invalidation and promotion together', async () => {
  const f = fixture({ failWrite: true });
  await assert.rejects(provisionAdmin(f.connection, request, env), /synthetic write failure/);
  assert.deepEqual(f.state().users[0].roles, ['Member']);
  assert.equal(f.db.revoked, false);
  assert.equal(f.db.challengesDeleted, false);
  assert.equal(f.released(), true);
});

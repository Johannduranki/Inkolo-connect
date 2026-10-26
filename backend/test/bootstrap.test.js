import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { bootstrapDatabase, emptyPlatformState } from '../scripts/bootstrap.js';
import { activeMigrationFiles } from '../src/schema-migration.js';
import { platformDigest } from '../src/mysql-platform-store.js';

const env = { MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') };
const files = activeMigrationFiles(await readdir(new URL('../database/', import.meta.url)));

function fixture({ nonempty, missingMigration, busy = false, version = '10.11.0-MariaDB' } = {}) {
  const db = { documents: [], chunks: [], metadata: {}, catalogue: [] };
  let snapshot, commits = 0, rollbacks = 0, releases = 0, writes = 0;
  const connection = {
    beginTransaction: async () => { snapshot = structuredClone(db); },
    commit: async () => { commits++; },
    rollback: async () => { rollbacks++; Object.assign(db, snapshot); },
    query: async sql => {
      if (sql.includes('VERSION()')) return [[{ version }]];
      if (sql.includes('schema_migrations')) return [files.filter(f => f !== missingMigration).map(filename => ({ filename }))];
      if (sql.includes('DATABASE()')) return [[{ name: 'synthetic' }]];
      if (sql.includes('COUNT(*)')) return [[{ n: sql.endsWith(nonempty || 'NEVER') ? 1 : 0 }]];
      if (sql.includes('duranki_platform_migration')) return [db.metadata.platform ? [db.metadata.platform] : []];
      throw Error('Unexpected query: ' + sql);
    },
    execute: async (sql, params = []) => {
      if (sql.includes('GET_LOCK')) return [[{ acquired: busy ? 0 : 1 }]];
      if (sql.includes('RELEASE_LOCK')) { releases++; return [[]]; }
      if (sql.startsWith('SELECT')) {
        if (sql.includes('duranki_platform_document')) return [[...db.documents]];
        if (sql.includes('duranki_platform_chunk')) return [db.chunks];
        if (sql.includes('duranki_service_write_lock')) return [[{ service: params[0] }]];
        const group = sql.includes('duranki_service_migration') ? params[0] : sql.match(/duranki_(\w+)_migration/)[1];
        return [db.metadata[group] ? [db.metadata[group]] : []];
      }
      writes++;
      if (sql.startsWith('INSERT INTO duranki_platform_document')) {
        const [id, revision, sha256, chunk_count, byte_length] = params;
        db.documents.push({ id, revision, sha256, chunk_count, byte_length });
      } else if (sql.startsWith('INSERT INTO duranki_platform_chunk')) {
        db.chunks.push({ chunk_index: params[1], payload: Buffer.from(params[2]) });
      } else if (sql.startsWith('DELETE FROM duranki_platform_chunk')) {
        db.chunks = db.chunks.filter(c => c.chunk_index < params[1]);
      } else if (sql.startsWith('INSERT INTO heritage_catalogue')) {
        db.catalogue.push(params);
      } else if (sql.includes('_migration')) {
        const group = sql.includes('duranki_service_migration') ? params[0] : sql.match(/duranki_(\w+)_migration/)[1];
        db.metadata[group] = { id: 1, key_sha256: group === 'auth' ? params[1] : undefined };
      } else throw Error('Unexpected write: ' + sql);
      return [{ affectedRows: 1 }];
    }
  };
  return { db, connection, counters: () => ({ commits, rollbacks, releases, writes }) };
}

test('empty platform contains no sample records or accounts and disables demo operation', () => {
  const state = emptyPlatformState();
  assert.equal(state.realDataOnly, true);
  assert.equal(state.demoUsersDisabled, true);
  assert.ok(Object.values(state).filter(Array.isArray).every(rows => rows.length === 0));
  state.users.push({ id: 'synthetic' });
  assert.deepEqual(emptyPlatformState().users, []);
});
test('fresh bootstrap initializes every store, preserves key digest and only seeds reference catalogue', async () => {
  const f = fixture();
  assert.equal((await bootstrapDatabase(f.connection, env)).platform, 'created');
  assert.deepEqual(Object.keys(f.db.metadata).sort(), ['auth', 'cycle', 'heritage', 'platform', 'training', 'treasury']);
  assert.equal(f.db.metadata.auth.key_sha256, platformDigest(Buffer.from(env.MFA_ENCRYPTION_KEY, 'base64')));
  assert.deepEqual(f.db.catalogue, [['duranki-heritage', 'Duranki Heritage / Family Tree']]);
  assert.deepEqual(JSON.parse(Buffer.concat(f.db.chunks.map(c => c.payload))), emptyPlatformState());
  assert.equal(f.counters().commits, 1);
  const before = f.counters().writes;
  assert.equal((await bootstrapDatabase(f.connection, env)).platform, 'preserved');
  assert.equal(f.counters().writes, before);
});
test('nonempty uninitialized stores roll back the entire bootstrap', async () => {
  for (const nonempty of ['users', 'duranki_mfa_credential', 'duranki_auth_identity', 'duranki_treasury_staff', 'duranki_training_audit', 'cycle_request', 'heritage_person']) {
    const f = fixture({ nonempty });
    await assert.rejects(bootstrapDatabase(f.connection, env), /nonempty/);
    assert.equal(f.db.documents.length, 0);
    assert.deepEqual(f.db.metadata, {});
    assert.equal(f.counters().commits, 0);
    assert.equal(f.counters().rollbacks, 1);
    assert.equal(f.counters().releases, 1);
  }
});
test('missing migrations, busy writer and invalid keys fail before writes', async () => {
  for (const options of [{ missingMigration: files.at(-1) }, { busy: true }, { version: '8.4.0-MySQL' }]) {
    const f = fixture(options);
    await assert.rejects(bootstrapDatabase(f.connection, env));
    assert.equal(f.counters().writes, 0);
  }
  for (const key of ['', 'bad', Buffer.alloc(31).toString('base64'), env.MFA_ENCRYPTION_KEY + '\n']) {
    const f = fixture();
    await assert.rejects(bootstrapDatabase(f.connection, { MFA_ENCRYPTION_KEY: key }), /MFA_ENCRYPTION_KEY/);
    assert.equal(f.counters().writes, 0);
  }
});
test('existing key mismatch and corrupt documents cannot be repaired by bootstrap', async () => {
  const f = fixture();
  await bootstrapDatabase(f.connection, env);
  const before = f.counters().writes;
  await assert.rejects(bootstrapDatabase(f.connection, { MFA_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString('base64') }), /key mismatch/);
  assert.equal(f.counters().writes, before);
  f.db.documents[0].sha256 = 'corrupt';
  await assert.rejects(bootstrapDatabase(f.connection, env), /checksum/);
  assert.equal(f.counters().writes, before);
});

test('rerun preserves existing synthetic accounts and refuses inconsistent platform metadata', async () => {
  const f = fixture();
  await bootstrapDatabase(f.connection, env);
  const state = emptyPlatformState();
  state.users.push({ id: 'synthetic-account', passwordHash: 'synthetic-hash' });
  const bytes = Buffer.from(JSON.stringify(state));
  f.db.chunks = [{ chunk_index: 0, payload: bytes }];
  Object.assign(f.db.documents[0], { sha256: platformDigest(bytes), byte_length: bytes.length });
  const before = f.counters().writes;
  await bootstrapDatabase(f.connection, env);
  assert.deepEqual(JSON.parse(Buffer.concat(f.db.chunks.map(c => c.payload))), state);
  assert.equal(f.counters().writes, before);
  f.db.documents = [];
  await assert.rejects(bootstrapDatabase(f.connection, env), /without its document/);
  assert.equal(f.counters().writes, before);
});

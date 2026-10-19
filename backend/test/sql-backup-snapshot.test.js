import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { identifier, sealSnapshot, openSnapshot, restoreTables, tableSnapshot, snapshotKind } from '../src/sql-backup-snapshot.js';

test('encrypted snapshots round-trip metadata and reject wrong keys or modified ciphertext', () => {
  const key = randomBytes(32), original = { kind: snapshotKind, tables: [], private: 'synthetic-only' };
  const encrypted = sealSnapshot(original, key);
  assert.ok(!encrypted.includes('synthetic-only'));
  assert.deepEqual(openSnapshot(encrypted, key), original);
  assert.throws(() => openSnapshot(encrypted, randomBytes(32)));
  const tampered = JSON.parse(encrypted), bytes = Buffer.from(tampered.ciphertext, 'base64');
  bytes[0] ^= 1; tampered.ciphertext = bytes.toString('base64');
  assert.throws(() => openSnapshot(Buffer.from(JSON.stringify(tampered)), key));
});

test('restore refuses an existing database before issuing any DDL or DML', async () => {
  const statements = [];
  await assert.rejects(restoreTables({ query: async sql => { statements.push(sql); return [[{ table: 'existing' }]]; } }, { tables: [] }), /must be empty/);
  assert.deepEqual(statements, ['SHOW TABLES']);
});

test('snapshot identifiers reject cross-database and injected names', () => {
  assert.equal(identifier('duranki_auth_session'), '`duranki_auth_session`');
  for (const invalid of ['live.users', 'a`; DROP TABLE users', '', '../data']) assert.throws(() => identifier(invalid));
});

test('binary and structured JSON cells remain distinct during snapshot restore', async () => {
  const row = [Buffer.from([0, 255, 10]), { binary: 'ordinary JSON property', nested: [1, null] }, null];
  let inserted;
  const connection = {
    query: async sql => {
      if (typeof sql === 'object') return [[row]];
      if (sql.startsWith('SHOW CREATE')) return [[{ 'Create Table': 'CREATE TABLE `fixture` (`blob` BLOB, `payload` JSON, `empty` TEXT)' }]];
      if (sql.startsWith('SHOW FULL')) return [[...['blob', 'payload', 'empty'].map(Field => ({ Field, Extra: '' }))]];
      return [[]];
    },
    execute: async (_sql, values) => { inserted = values; }
  };
  const table = await tableSnapshot(connection, 'fixture');
  const key = randomBytes(32);
  const snapshot = openSnapshot(sealSnapshot({ kind: snapshotKind, tables: [table] }, key), key);
  await restoreTables(connection, snapshot);
  assert.deepEqual(inserted[0], row[0]);
  assert.deepEqual(JSON.parse(inserted[1]), row[1]);
  assert.equal(inserted[2], null);
});

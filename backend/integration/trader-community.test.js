import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { integrationDatabaseConfig } from './isolated-stores.js';
import { MysqlPlatformStore, writeSqlDocument } from '../src/mysql-platform-store.js';
import { migrateTraderCommunity, hierarchyVersion } from '../src/trader-community-hierarchy.js';

test('Trader hierarchy changes commit atomically in MariaDB and survive restart without changing balances', async t => {
  const pool = mysql.createPool(integrationDatabaseConfig());
  const id = 'hierarchy-test-' + randomUUID();
  const store = new MysqlPlatformStore(pool, id); let reopened;
  t.after(async () => {
    await store.close(); await reopened?.close();
    try {
      await pool.execute('DELETE FROM duranki_platform_chunk WHERE document_id=?', [id]);
      await pool.execute('DELETE FROM duranki_platform_document WHERE id=?', [id]);
    } finally { await pool.end(); }
  });
  const source = { users: [], importedCommunities: [{ id: 'trader-ilembe', tenantId: 'tenant-trader-connect', name: 'Traders KZN' }],
    memberCommunities: [{ memberId: 'synthetic', communityId: 'trader-ilembe', tenantId: 'tenant-trader-connect' }],
    wallets: [{ ownerId: 'synthetic', balance: 10000 }], trainingStudyProgress: [{ userId: 'synthetic', tenantId: 'tenant-trader-connect', completedAt: '2026-01-01' }] };
  const connection = await pool.getConnection();
  try { await connection.beginTransaction(); await writeSqlDocument(connection, id, source, 1); await connection.commit(); }
  finally { connection.release(); }
  await store.open();
  await assert.rejects(store.update(s => { migrateTraderCommunity(s); throw Error('synthetic interruption'); }), /synthetic interruption/);
  assert.equal(store.read().memberCommunities[0].tenantId, 'tenant-trader-connect');
  await store.update(migrateTraderCommunity); await store.close();
  reopened = new MysqlPlatformStore(pool, id); await reopened.open();
  const result = reopened.read();
  assert.equal(result.memberCommunities[0].tenantId, 'tenant-inkolo');
  assert.equal(result.importedCommunities[0].name, 'Trader Connect');
  assert.deepEqual(result.wallets, source.wallets);
  assert.deepEqual(result.trainingStudyProgress, source.trainingStudyProgress);
  assert.ok(result.hierarchyMigrations[hierarchyVersion].snapshot);
  assert.equal(await reopened.update(migrateTraderCommunity), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {assertDatabaseReady} from '../src/database-readiness.js';
const names = ['users','user_roles','service_subscriptions','service_applications','member_profiles','member_communities','wallets','wallet_transactions'];
const pool = (tables, users) => ({query:async sql => [sql.includes('information_schema') ? tables.map(name => ({name})) : users]});
test('database readiness blocks an empty database and missing imported users', async () => {
  await assert.rejects(assertDatabaseReady(pool([],[]),[]), {code:'ER_DURANKI_MIGRATION_REQUIRED'});
  await assert.rejects(assertDatabaseReady(pool(names,[{id:1}]),[{id:1},{id:2}]), {code:'ER_DURANKI_MIGRATION_REQUIRED'});
});
test('database readiness accepts minimum schema and preserved user IDs', async () => {
  await assertDatabaseReady(pool(names,[{id:1}]),[{id:'1'}]);
});

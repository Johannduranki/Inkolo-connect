import test from 'node:test';
import assert from 'node:assert/strict';
import { integrationDatabaseConfig } from '../integration/isolated-stores.js';

const fixture={MARIADB_INTEGRATION_TEST:'1',DB_HOST:'127.0.0.1',DB_PORT:'13319',DB_USER:'fixture_user',DB_NAME:'duranki_test',DB_PASSWORD:'synthetic'};
test('integration opt-in accepts loopback test databases without a fixed port or username',()=>{
  for(const host of ['127.0.0.1','::1','localhost'])for(const database of ['duranki_test','duranki_test_ci_42','application_test']){
    const config=integrationDatabaseConfig({...fixture,DB_HOST:host,DB_NAME:database,DB_PORT:'3307'});
    assert.equal(config.host,host);assert.equal(config.database,database);assert.equal(config.port,3307);assert.equal(config.user,'fixture_user');
  }
  assert.equal(integrationDatabaseConfig({...fixture,DB_PORT:undefined}).port,3306);
});
test('integration guard rejects production, absent opt-in and non-local or non-test destinations',()=>{
  for(const override of [
    {MARIADB_INTEGRATION_TEST:undefined},{MARIADB_INTEGRATION_TEST:'true'},{NODE_ENV:'production'},
    {DB_HOST:'db.example.test'},{DB_HOST:'0.0.0.0'},{DB_HOST:'127.0.0.1.example.com'},
    {DB_NAME:'duranki'},{DB_NAME:'production'},{DB_NAME:'test'},{DB_NAME:'duranki_test;DROP'},
    {DB_USER:''},{DB_PORT:'0'},{DB_PORT:'65536'},{DB_PORT:'3.5'},{DB_PORT:'not-a-port'}
  ])assert.throws(()=>integrationDatabaseConfig({...fixture,...override}),/Integration fixtures require/);
});

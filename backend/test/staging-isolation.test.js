import test from 'node:test';
import assert from 'node:assert/strict';
import { stagingEnvironment, stagingState, stagingBanner, accountSpecs } from '../../scripts/staging-support.mjs';

test('staging ignores inherited database, payment, Node preload and authentication secrets', () => {
  const inherited = { PATH: 'tools', DB_HOST: 'production', DB_PORT: '3306', DB_PASSWORD: 'live-password',
    CYCLE_PAYWALL_SECRET: 'live-secret', CYCLE_ENABLED: 'true', NODE_OPTIONS: '--import=live.mjs', AUTH_STORAGE: 'mariadb', JWT_SECRET: 'live-jwt' };
  const env = stagingEnvironment('/isolated/staging/run-test', 4300, { jwt: 'a'.repeat(64), pepper: 'b'.repeat(64) }, inherited);
  assert.equal(env.DB_PORT, '9'); assert.equal(env.DB_HOST, '127.0.0.1');
  assert.equal(env.CYCLE_ENABLED, 'false'); assert.equal(env.CYCLE_MODE, 'sandbox');
  assert.equal(env.CYCLE_PAYWALL_SECRET, undefined); assert.equal(env.NODE_OPTIONS, undefined);
  assert.equal(env.AUTH_STORAGE, 'sqlite'); assert.equal(env.PLATFORM_STORAGE, 'json');
  assert.equal(env.JWT_SECRET, 'a'.repeat(64)); assert.equal(env.PATH, 'tools');
  assert.ok(!Object.values(env).includes('live-password'));
});

test('staging refuses live ports and missing private keys', () => {
  const keys = { jwt: 'a'.repeat(64), pepper: 'b'.repeat(64) };
  for (const port of [3000, 3306, 4200, 0, NaN, 4300.1]) assert.throws(() => stagingEnvironment('/stage', port, keys));
  assert.throws(() => stagingEnvironment('/stage', 4300, {}));
});

test('synthetic fixture separates tenant and provider permissions and never seeds funds', () => {
  const accounts = accountSpecs.map(([name, roles], i) => ({ name, roles, telephoneNumber: '000000'+String(1001+i), passwordHash: 'synthetic-hash', password: 'must-not-persist' }));
  const state = stagingState(accounts);
  assert.equal(state.users.length, 7); assert.equal(state.demoUsersDisabled, true);
  assert.equal(state.stagingOnly, true); assert.equal(state.walletTransactions.length, 0); assert.equal(state.wallets.length, 0);
  assert.equal(JSON.stringify(state).includes('must-not-persist'), false);
  assert.equal(state.users.filter(u => u.roles.includes('Platform Admin')).length, 1);
  assert.equal(state.tenantStaff[0].tenantId, 'tenant-stage-a'); assert.equal(state.tenantStaff[1].tenantId, 'tenant-stage-b');
  assert.equal(state.providerAccessGrants[0].tenantId, 'tenant-stage-a');
  assert.equal(state.memberCommunities.filter(m => m.memberId === '91006').length, 2);
});

test('staging banner identifies test screens while preserving their scripts', () => {
  const output = stagingBanner('<html><title>Duranki</title><body class="page"><main>Screen</main><script src="/mfa-navigation.js"></script></body></html>');
  assert.match(output, /STAGING \| Duranki/); assert.match(output, /Synthetic data only/);
  assert.match(output, /body class="page"/); assert.match(output, /src="\/mfa-navigation.js"/);
});

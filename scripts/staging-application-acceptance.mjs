import { readFileSync, writeFileSync, realpathSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = realpathSync(process.argv[2]);
const read = file => JSON.parse(readFileSync(path.join(root, file)));
const manifest = read('manifest.json');
assert.equal(manifest.kind, 'duranki-isolated-rehearsal-v1');
assert.equal(manifest.root, root);
assert.equal(path.basename(path.dirname(root)), 'staging');
const statePath = 'backend/data/platform-store.json';
const state = read(statePath);
assert.equal(state.stagingOnly, true);
assert.ok(state.users.every(u => u.email.endsWith('@example.test')));
const communityId = 'community-stage-training-acceptance';
if (process.argv.includes('--prepare')) {
  assert.ok(!existsSync(path.join(root, 'running.json')), 'Prepare only an unstarted disposable fork');
  assert.ok(!state.importedCommunities.some(c => c.id === communityId));
  state.tenantAccessDirectory.push({ id: 'tenant-trader-connect', name: 'Synthetic Trader Connect' });
  state.importedCommunities.push({ id: communityId, name: 'Synthetic Training Acceptance', tenantId: 'tenant-trader-connect', status: 'active' });
  state.memberCommunities.push({ memberId: '91004', communityId, churchId: communityId, tenantId: 'tenant-trader-connect', isPrimary: false });
  writeFileSync(path.join(root, statePath), JSON.stringify(state, null, 2));
  console.log('Prepared synthetic training membership in disposable fork only.');
  process.exit(0);
}
const running = read('running.json');
assert.equal(running.root, root);
assert.ok(running.port >= 4300 && running.port <= 4399);
const tokens = new Map(), checks = [];
async function request(actor, route, method = 'GET', body, expected = 200) {
  const response = await fetch(`http://127.0.0.1:${running.port}${route}`, {
    method, redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', ...(tokens.has(actor) ? { Authorization: 'Bearer ' + tokens.get(actor) } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  assert.equal(response.status, expected, `${method} ${route}: HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}
let completed = false;
try {
  const health = await request(null, '/api/health');
  assert.equal(health.platformStorage, 'json');
  assert.equal(health.authenticationStorage, 'sqlite');
  const accounts = read('accounts.private.json'), mfa = read('mfa.private.json');
  const { authenticator } = createRequire(path.join(root, 'backend/package.json'))('@otplib/v12-adapter');
  for (const actor of ['platform', 'member-a', 'member-b', 'tenant-a']) {
    const account = accounts.find(a => a.name === actor);
    let login = await request(null, '/api/auth/login', 'POST', { telephoneNumber: account.telephoneNumber, password: account.password });
    tokens.set(actor, login.accessToken);
    if (login.mfaRequired) {
      login = await request(actor, '/api/auth/mfa/verify', 'POST', { code: authenticator.generate(mfa[actor].secret) });
      tokens.set(actor, login.accessToken);
    }
  }
  const pricing = await request('platform', '/api/service-pricing');
  for (const code of ['trader-training', 'grant-distribution']) {
    const price = pricing.services.find(p => p.code === code);
    await request('platform', '/api/service-pricing/' + code, 'PUT', { mode: 'free', amountCents: 0, costCents: 0, shares: { community: 3000, tenant: 3000, duranki: 4000 }, revision: price.revision });
    const subscription = await request('member-a', '/api/subscriptions', 'POST', { serviceCode: code, planCode: 'configured-free', acceptance: { accepted: true } }, 201);
    assert.equal(subscription.amountCents, 0);
    assert.equal(subscription.status, 'active');
  }
  checks.push('Platform configures free Training and Grants; member subscribes to both through HTTP');
  const programme = await request('platform', '/api/trader-training/programmes', 'POST', { communityId }, 201);
  const modules = programme.modules.map((m, i) => ({ ...m, amountCents: (i + 1) * 10000 }));
  const publication = { name: 'Synthetic five-module acceptance', revision: programme.revision, modules, publish: true };
  await request('tenant-a', '/api/trader-training/programmes/' + programme.id, 'PUT', publication, 403);
  await request('platform', '/api/trader-training/programmes/' + programme.id, 'PUT', publication);
  const access = await request('member-a', '/api/trader-training/access');
  const view = access.programmes.find(p => p.id === programme.id);
  assert.equal(view.modules[0].status, 'AVAILABLE');
  assert.ok(view.modules.slice(1).every(m => m.status === 'LOCKED' && !m.content && !m.questions.length));
  assert.ok(view.modules[0].questions.every(q => !Object.hasOwn(q, 'correctIndex')));
  checks.push('Platform alone publishes funding; member receives first lesson without answer keys or locked content');
  const attempt = (actor, module, answers, expected = 200) => request(actor, `/api/trader-training/programmes/${programme.id}/modules/${module.id}/attempts`, 'POST', { answers }, expected);
  const answers = m => Object.fromEntries(m.questions.map(q => [q.id, q.correctIndex]));
  await attempt('member-b', modules[0], answers(modules[0]), 403);
  await attempt('member-a', modules[1], answers(modules[1]), 409);
  const wrong = answers(modules[0]);
  wrong[modules[0].questions[0].id] = (modules[0].questions[0].correctIndex + 1) % modules[0].questions[0].options.length;
  const failed = await attempt('member-a', modules[0], wrong);
  assert.equal(failed.passed, false);
  assert.equal(failed.dashboard.unlockedAmountCents, 0);
  checks.push('Nonmember and skipped module rejected; less than 100% unlocks no funding');
  let expectedAmount = 0;
  for (const [index, module] of modules.entries()) {
    const result = await attempt('member-a', module, answers(module));
    expectedAmount += module.amountCents;
    assert.equal(result.score, 100);
    assert.equal(result.dashboard.completedModules, index + 1);
    assert.equal(result.dashboard.unlockedAmountCents, expectedAmount);
    if (index < 4) assert.equal(result.dashboard.modules[index + 1].status, 'AVAILABLE');
  }
  const replay = await attempt('member-a', modules[0], answers(modules[0]));
  assert.equal(replay.alreadyCompleted, true);
  assert.equal(replay.dashboard.grants.length, 5);
  assert.equal(replay.dashboard.unlockedAmountCents, 150000);
  assert.ok(replay.dashboard.grants.every(g => g.status === 'ELIGIBLE'));
  const final = read(statePath);
  for (const key of ['wallets', 'walletTransactions', 'transactions', 'users', 'providerAccessGrants', 'tenantStaff']) assert.deepEqual(final[key], state[key], key + ' unchanged');
  checks.push('Five sequential passes unlock exact amounts once; replay creates no duplicate; wallets and permissions unchanged');
  completed = true;
} finally {
  for (const actor of tokens.keys()) await request(actor, '/api/auth/logout', 'POST', {}, 204).catch(() => {});
  const result = { at: new Date().toISOString(), root, completed, checks, scope: 'Disposable synthetic JSON/SQLite HTTP integration only; no live data, MariaDB or Cycle Pay configuration changed' };
  writeFileSync(path.join(root, 'application-acceptance.results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}

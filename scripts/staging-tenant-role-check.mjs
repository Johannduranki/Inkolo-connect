import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = realpathSync(path.resolve(process.argv[2] || ''));
const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json')));
const running = JSON.parse(readFileSync(path.join(root, 'running.json')));
assert.equal(manifest.kind, 'duranki-isolated-rehearsal-v1');
assert.equal(manifest.root, root); assert.equal(running.root, root);
assert.ok(running.port >= 4300 && running.port <= 4399);
assert.equal(path.basename(path.dirname(root)), 'staging');
const stateFile = path.join(root, 'backend/data/platform-store.json');
const initial = JSON.parse(readFileSync(stateFile));
assert.equal(initial.stagingOnly, true);
assert.ok(initial.users.every(u => u.email.endsWith('@example.test')));
const marker = path.join(root, 'tenant-role-check.results.json');
const accounts = JSON.parse(readFileSync(path.join(root, 'accounts.private.json')));
const mfa = JSON.parse(readFileSync(path.join(root, 'mfa.private.json')));
const { authenticator } = createRequire(path.join(root, 'backend/package.json'))('@otplib/v12-adapter');
const tokens = new Map(), checks = [];
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
let original, restored = false, completed = false;
async function request(actor, route, method = 'GET', body, expected = 200) {
  const response = await fetch(`http://127.0.0.1:${running.port}${route}`, {
    method, redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', ...(tokens.has(actor) ? { Authorization: 'Bearer ' + tokens.get(actor) } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  assert.equal(response.status, expected, `${method} ${route}: HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}
const route = '/api/tenant-access/tenant-stage-a/staff';
try {
  const health = await request(null, '/api/health');
  assert.equal(health.platformStorage, 'json'); assert.equal(health.authenticationStorage, 'sqlite');
  for (const actor of ['platform', 'tenant-a']) {
    const account = accounts.find(a => a.name === actor);
    const login = await request(null, '/api/auth/login', 'POST', { telephoneNumber: account.telephoneNumber, password: account.password });
    assert.equal(login.mfaRequired, true);
    tokens.set(actor, login.accessToken);
    const verified = await request(actor, '/api/auth/mfa/verify', 'POST', { code: authenticator.generate(mfa[actor].secret) });
    tokens.set(actor, verified.accessToken);
  }
  original = (await request('platform', route)).staff.find(row => row.userId === '91002');
  assert.equal(original.status, 'active');
  const before = await request('tenant-a', '/api/auth/me');
  assert.ok(before.roles.includes('Tenant Staff')); checks.push('initial current profile includes tenant role');
  await request('platform', route + '/' + original.id, 'PUT', { permissions: original.permissions, status: 'revoked' });
  const revoked = await request('tenant-a', '/api/auth/me');
  assert.ok(!revoked.roles.includes('Tenant Staff')); assert.ok(revoked.roles.includes('Member'));
  assert.deepEqual(await request('tenant-a', '/api/tenant-access'), []);
  checks.push('same session loses role and tenant access immediately');
  await request('platform', route + '/' + original.id, 'PUT', { permissions: original.permissions, status: original.status });
  restored = true;
  const active = await request('tenant-a', '/api/auth/me');
  assert.equal(active.roles.filter(r => r === 'Tenant Staff').length, 1);
  assert.deepEqual((await request('tenant-a', '/api/tenant-access')).map(t => t.id), ['tenant-stage-a']);
  checks.push('reactivation restores exactly one role and correct tenant');
  const final = JSON.parse(readFileSync(stateFile));
  const canonicalUsers = users => users.map(user => ({ ...user, roles: [...user.roles].sort() }));
  assert.equal(digest(canonicalUsers(final.users)), digest(canonicalUsers(initial.users)));
  assert.equal(digest(final.providerAccessGrants), digest(initial.providerAccessGrants));
  checks.push('user credentials roles and provider grants preserved');
  completed = true;
} finally {
  if (original && !restored && tokens.has('platform')) {
    await request('platform', route + '/' + original.id, 'PUT', { permissions: original.permissions, status: original.status });
    restored = true;
  }
  for (const actor of tokens.keys()) await request(actor, '/api/auth/logout', 'POST', {}, 204);
  writeFileSync(marker, JSON.stringify({ at: new Date().toISOString(), completed, restored, checks, liveWrites: false, browserTest: false }, null, 2));
}
console.log(JSON.stringify({ completed, restored, checks: checks.length, browserTest: false }));

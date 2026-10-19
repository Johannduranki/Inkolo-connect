import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import { stagingKind } from './staging-support.mjs';

const root = path.resolve(process.argv[2] || '');
const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const running = JSON.parse(readFileSync(path.join(root, 'running.json'), 'utf8'));
assert.equal(manifest.kind, stagingKind); assert.equal(manifest.root, root); assert.equal(running.root, root);
assert.equal(path.basename(path.dirname(root)), 'staging'); assert.match(path.basename(root), /^run-/);
assert.equal(realpathSync(path.join(root, 'backend/data')), path.join(root, 'backend/data'));
assert.ok(running.port >= 4300 && running.port <= 4399);
const stateFile = path.join(root, 'backend/data/platform-store.json');
assert.equal(JSON.parse(readFileSync(stateFile, 'utf8')).stagingOnly, true);
const digest = () => createHash('sha256').update(readFileSync(stateFile)).digest('hex');
const before = digest();
const accounts = JSON.parse(readFileSync(path.join(root, 'accounts.private.json'), 'utf8'));
const mfa = JSON.parse(readFileSync(path.join(root, 'mfa.private.json'), 'utf8'));
const { authenticator } = createRequire(path.join(root, 'backend/package.json'))('@otplib/v12-adapter');
const tokens = new Map(), checks = [];
let completed = false;
async function check(label, route, actor, status = 200, body) {
  assert.ok(route.startsWith('/') && !route.startsWith('//'));
  const response = await fetch(`http://127.0.0.1:${running.port}${route}`, {
    method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', ...(tokens.has(actor) ? { Authorization: 'Bearer ' + tokens.get(actor) } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  assert.equal(response.status, status, `${label}: unexpected HTTP ${response.status}`);
  checks.push(label);
  return response;
}
const health = await (await check('isolated storage', '/api/health')).json();
assert.equal(health.authenticationStorage, 'sqlite'); assert.equal(health.platformStorage, 'json');
try {
  for (const name of ['platform', 'tenant-a', 'provider-a', 'member-a', 'member-b']) {
    const account = accounts.find(a => a.name === name);
    const signedIn = await (await check(`${name}: password`, '/api/auth/login', null, 200, { telephoneNumber: account.telephoneNumber, password: account.password })).json();
    tokens.set(name, signedIn.accessToken);
    if (signedIn.mfaRequired) {
      await check(`${name}: unverified challenge denied`, '/api/platform/service-provider/workspace', name, 403);
      const verified = await (await check(`${name}: existing MFA`, '/api/auth/mfa/verify', name, 200, { code: authenticator.generate(mfa[name].secret) })).json();
      tokens.set(name, verified.accessToken);
    }
    await check(`${name}: authenticated identity`, '/api/auth/me', name);
  }
  const workspace = await (await check('provider: authorized workspace', '/api/platform/service-provider/workspace?userId=91001&tenantId=tenant-stage-b', 'provider-a')).json();
  assert.deepEqual(workspace.scopes.map(s => [s.serviceProviderId, s.tenantId, s.communityId]), [['provider-stage-a', 'tenant-stage-a', 'community-stage-a']]);
  assert.equal(workspace.documents.length, 1);
  assert.equal(workspace.documents[0].memberId, '91004');
  for (const name of ['tenant-a', 'member-a', 'member-b']) await check(`${name}: provider workspace denied`, '/api/platform/service-provider/workspace', name, 403);
  await check('anonymous: provider workspace denied', '/api/platform/service-provider/workspace', null, 401);
  for (const name of ['provider-a', 'member-a']) await check(`${name}: authorized file`, workspace.documents[0].fileUrl, name);
  await check('foreign member: private file hidden', workspace.documents[0].fileUrl, 'member-b', 404);
  await check('anonymous: private file denied', workspace.documents[0].fileUrl, null, 401);
  await check('tenant-a: own report', '/api/community-reports?communityId=community-stage-a', 'tenant-a');
  await check('tenant-a: foreign report denied', '/api/community-reports?communityId=community-stage-b', 'tenant-a', 403);
  const directory = await (await check('platform: provider grant directory', '/api/platform/admin/provider-grants', 'platform')).json();
  assert.equal(directory.length, 1); assert.equal(directory[0].status, 'active');
  const billing = await (await check('payment configuration remains unavailable', '/api/cycle/billing', 'member-a')).json();
  assert.equal(billing.ready, false); assert.equal(billing.recurringReady, false); assert.equal(billing.topUpsEnabled, false);
  assert.equal(digest(), before, 'Business records changed during read-only checks.');
  completed = true;
} finally {
  for (const [name] of tokens) {
    await check(`${name}: logout`, '/api/auth/logout', name, 204, {});
    await check(`${name}: session rejected after logout`, '/api/auth/me', name, 401);
  }
  writeFileSync(path.join(root, 'workspace-check.results.json'), JSON.stringify({ completed, passed: checks.length, checks, at: new Date().toISOString(),
    platformRecordsUnchanged: digest() === before, paymentConfigurationChanged: false, privilegedBrowserTest: false }, null, 2));
}
console.log(JSON.stringify({ completed, passed: checks.length, platformRecordsUnchanged: digest() === before, privilegedBrowserTest: false }));

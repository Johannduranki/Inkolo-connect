import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { stagingKind } from './staging-support.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const running = JSON.parse(readFileSync(path.join(root, 'running.json'), 'utf8'));
assert.equal(manifest.kind, stagingKind); assert.equal(manifest.root, root); assert.equal(running.root, root);
assert.ok(running.port >= 4300 && running.port <= 4399);
const base = `http://127.0.0.1:${running.port}`;
const checks = [];
const api = async (url, token, body) => fetch(base + url, { method: body ? 'POST' : 'GET',
  headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined, redirect: 'error' });
const health = await (await api('/api/health')).json();
for (const key of ['authenticationStorage','treasuryStorage','trainingStorage','cycleStorage','heritageStorage']) assert.equal(health[key], 'sqlite');
assert.equal(health.platformStorage, 'json'); checks.push('isolated storage health');
assert.match(await (await api('/login')).text(), /STAGING REHEARSAL/); checks.push('visible staging banner');
const accounts = JSON.parse(readFileSync(path.join(root, 'accounts.private.json'), 'utf8'));
const login = async name => { const account = accounts.find(a => a.name === name); const r = await api('/api/auth/login', null, { telephoneNumber: account.telephoneNumber, password: account.password }); assert.equal(r.status, 200); return r.json(); };
const member = await login('member-a'); assert.equal(member.mfaRequired, undefined);
assert.equal((await api('/api/auth/me', member.accessToken)).status, 200);
for (const url of ['/api/platform/admin/users','/api/platform/service-provider/documents','/api/tenant-access/tenant-stage-b/staff','/api/community-reports?communityId=community-stage-b']) assert.equal((await api(url, member.accessToken)).status, 403);
checks.push('member cannot enter admin, provider or foreign reporting areas');
const membership = await (await api('/api/community-registration', member.accessToken)).json();
assert.deepEqual(membership.communities.filter(c => c.joined).map(c => c.id), ['community-stage-a']);
checks.push('single-community membership');
assert.equal((await api('/api/auth/logout', member.accessToken, {})).status, 204);
assert.equal((await api('/api/auth/me', member.accessToken)).status, 401); checks.push('logout revokes session');
assert.equal((await api('/api/auth/mfa/status', member.accessToken)).status, 401); checks.push('status endpoint rejects revoked sessions');
const multi = await login('multi-member');
const memberships = await (await api('/api/community-registration', multi.accessToken)).json();
assert.equal(memberships.communities.filter(c => c.joined).length, 2); checks.push('multi-community membership');
await api('/api/auth/logout', multi.accessToken, {});
for (const name of ['platform','tenant-a','provider-a']) {
  const challenge = await login(name); assert.equal(challenge.mfaRequired, true);
  assert.equal((await api('/api/auth/me', challenge.accessToken)).status, 403);
  checks.push(name + ' requires MFA before protected APIs');
}
console.log(JSON.stringify({ environment: stagingKind, passed: checks.length, checks, realPaymentsAttempted: false, liveDataTouched: false }, null, 2));

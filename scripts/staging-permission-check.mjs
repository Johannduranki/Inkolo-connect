import { readFileSync, writeFileSync, realpathSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import { stagingKind } from './staging-support.mjs';

// This acceptance runner is copied into a fresh rehearsal, never pointed at the live API.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const running = JSON.parse(readFileSync(path.join(root, 'running.json'), 'utf8'));
assert.equal(manifest.kind, stagingKind); assert.equal(manifest.root, root); assert.equal(running.root, root);
assert.equal(path.basename(path.dirname(root)), 'staging'); assert.match(path.basename(root), /^run-/);
assert.equal(realpathSync(path.join(root, 'backend/data')), path.join(root, 'backend/data'));
assert.ok(Number.isInteger(running.port) && running.port >= 4300 && running.port <= 4399);
const marker = path.join(root, 'permission-check.started.json');
assert.equal(existsSync(marker), false, 'Prepare a fresh snapshot for another acceptance run; existing test records are preserved.');
const base = `http://127.0.0.1:${running.port}`;
const checks = [], tokens = new Map();
let completed = false;
const accounts = JSON.parse(readFileSync(path.join(root, 'accounts.private.json'), 'utf8'));
const require = createRequire(path.join(root, 'backend/package.json'));
const { authenticator } = require('@otplib/v12-adapter');
const mfa = {};
const request = async (url, actor, body, method = body === undefined ? 'GET' : 'POST') => {
  assert.ok(url.startsWith('/') && !url.startsWith('//'));
  const token = tokens.get(actor);
  return fetch(base + url, { method, redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
};
const expect = async (label, url, actor, status = 200, body, method) => {
  const response = await request(url, actor, body, method);
  assert.equal(response.status, status, `${label}: HTTP ${response.status}, expected ${status}`);
  checks.push(label); return response;
};
const json = async (...args) => (await expect(...args)).json();
const health = await json('isolated storage', '/api/health');
for (const key of ['authenticationStorage','treasuryStorage','trainingStorage','cycleStorage','heritageStorage']) assert.equal(health[key], 'sqlite');
assert.equal(health.platformStorage, 'json');
assert.equal(JSON.parse(readFileSync(path.join(root, 'backend/data/platform-store.json'), 'utf8')).stagingOnly, true);
writeFileSync(marker, JSON.stringify({ startedAt: new Date().toISOString(), kind: stagingKind }), { flag: 'wx', mode: 0o600 });

try {
  for (const account of accounts) {
    const data = await json(`${account.name}: password login`, '/api/auth/login', null, 200,
      { telephoneNumber: account.telephoneNumber, password: account.password });
    tokens.set(account.name, data.accessToken);
    if (account.roles.some(role => role !== 'Member')) {
      assert.equal(data.mfaRequired, true);
      await expect(`${account.name}: challenge cannot access protected API`, '/api/auth/me', account.name, 403);
      const setup = await json(`${account.name}: normal MFA setup`, '/api/auth/mfa/setup', account.name, 200, {});
      const verified = await json(`${account.name}: normal MFA verification`, '/api/auth/mfa/verify', account.name, 200,
        { code: authenticator.generate(setup.secret) });
      mfa[account.name] = { secret: setup.secret, recoveryCodes: verified.recoveryCodes };
      writeFileSync(path.join(root, 'mfa.private.json'), JSON.stringify(mfa, null, 2), { mode: 0o600 });
      tokens.set(account.name, verified.accessToken);
    }
    await expect(`${account.name}: authenticated identity`, '/api/auth/me', account.name);
  }

  for (const side of ['a','b']) {
    const actor = `tenant-${side}`, other = side === 'a' ? 'b' : 'a';
    const directory = await json(`${actor}: scoped directory`, '/api/tenant-access', actor);
    assert.deepEqual(directory.map(t => t.id), [`tenant-stage-${side}`]);
    await expect(`${actor}: own staff`, `/api/tenant-access/tenant-stage-${side}/staff`, actor);
    await expect(`${actor}: foreign staff denied`, `/api/tenant-access/tenant-stage-${other}/staff`, actor, 403);
    const communities = await json(`${actor}: own communities`, `/api/tenant-access/tenant-stage-${side}/communities`, actor);
    assert.deepEqual(communities.map(c => c.id), [`community-stage-${side}`]);
    const report = await json(`${actor}: own report`, `/api/community-reports?communityId=community-stage-${side}`, actor);
    assert.equal(report.community.tenantId, `tenant-stage-${side}`);
    await expect(`${actor}: foreign report denied`, `/api/community-reports?communityId=community-stage-${other}`, actor, 403);
    await expect(`${actor}: invalid report date denied`, `/api/community-reports?communityId=community-stage-${side}&from=2026-02-30`, actor, 400);
    const brands = await json(`${actor}: branding edit scope`, '/api/branding', actor);
    assert.ok(brands.filter(b => b.canEdit).every(b => b.tenantId === `tenant-stage-${side}`));
    await expect(`${actor}: foreign logo write denied`, `/api/branding/tenant/tenant-stage-${other}`, actor, 403, {}, 'PUT');
    await expect(`${actor}: global user directory denied`, '/api/platform/admin/users', actor, 403);
    await expect(`${actor}: global role change denied`, '/api/platform/admin/users/91004/roles', actor, 403, { roles: ['Platform Admin'] }, 'PUT');
    await expect(`${actor}: unknown permission denied`, `/api/tenant-access/tenant-stage-${side}/staff/staff-stage-${side}`, actor, 400,
      { permissions: ['platform.admin'] }, 'PUT');
    await expect(`${actor}: provider grant creation denied`, '/api/platform/admin/provider-grants', actor, 403, {});
  }

  for (const actor of ['member-a','member-b','multi-member']) {
    for (const route of ['/api/platform/admin/users','/api/cycle/admin','/api/platform/admin/provider-grants','/api/platform/service-provider/documents'])
      await expect(`${actor}: denied ${route}`, route, actor, 403);
    assert.deepEqual(await json(`${actor}: no admin tenants`, '/api/tenant-access', actor), []);
  }
  for (const side of ['a','b','a']) {
    const membership = await json(`multi-member: select ${side}`, `/api/platform/community/me?communityId=community-stage-${side}`, 'multi-member');
    assert.equal(membership.communityId, `community-stage-${side}`);
    const peers = await json(`multi-member: peers in ${side}`, `/api/platform/community/members?communityId=community-stage-${side}&query=Staging`, 'multi-member');
    assert.equal(peers.some(p => String(p.id) === (side === 'a' ? '91005' : '91004')), false);
  }
  await expect('single-community member cannot select foreign community', '/api/platform/community/me?communityId=community-stage-b', 'member-a', 403);
  await expect('single-community member cannot search foreign peers', '/api/platform/community/members?communityId=community-stage-b&query=Staging', 'member-a', 403);

  const documentBody = (overrides = {}) => {
    const form = new FormData();
    for (const [key,value] of Object.entries({ memberId: '91004', serviceId: 'funeral-cover', serviceProviderId: 'provider-stage-a', tenantId: 'tenant-stage-a', communityId: 'community-stage-a', ...overrides })) form.set(key,value);
    form.set('file', new Blob(['%PDF-1.4\n% SYNTHETIC STAGING DOCUMENT\n%%EOF'], { type:'application/pdf' }), 'staging-only.pdf');
    return form;
  };
  const doc = await json('provider: authorized synthetic upload', '/api/platform/service-provider/documents', 'provider-a', 201, documentBody());
  const docs = await json('provider: scoped list ignores forged authority', '/api/platform/service-provider/documents?serviceProviderId=provider-stage-a&userId=91001&tenantId=tenant-stage-b', 'provider-a');
  assert.deepEqual(docs.map(d => d.id), [doc.id]);
  await expect('provider: authorized private download', doc.fileUrl, 'provider-a');
  await expect('document owner: private download', doc.fileUrl, 'member-a');
  await expect('foreign member: private download denied', doc.fileUrl, 'member-b', 404);
  await expect('same community does not grant document access', doc.fileUrl, 'multi-member', 404);
  await expect('anonymous private download denied', doc.fileUrl, null, 401);
  for (const [name, changes] of [['foreign member',{memberId:'91005'}],['foreign tenant',{tenantId:'tenant-stage-b'}],['foreign provider',{serviceProviderId:'provider-stage-b'}],['foreign service',{serviceId:'wallet'}]])
    await expect(`provider: ${name} upload denied`, '/api/platform/service-provider/documents', 'provider-a', 403, documentBody(changes));
  await json('platform: revoke synthetic provider grant', '/api/platform/admin/provider-grants', 'platform', 200,
    { userId:'91007',serviceProviderId:'provider-stage-a',tenantId:'tenant-stage-a',communityId:'community-stage-a',serviceCodes:['funeral-cover'],status:'revoked' });
  assert.deepEqual(await json('revoked provider: empty document list', '/api/platform/service-provider/documents?serviceProviderId=provider-stage-a', 'provider-a'), []);
  await expect('revoked provider: download denied immediately', doc.fileUrl, 'provider-a', 404);
  await expect('revoked provider: upload denied immediately', '/api/platform/service-provider/documents', 'provider-a', 403, documentBody());
  await expect('owner keeps document after provider revocation', doc.fileUrl, 'member-a');

  for (const side of ['a','b']) await json(`platform: stage Heritage ${side}`, '/api/heritage/configuration', 'platform', 200,
    {tenant_id:`tenant-stage-${side}`,community_id:`community-stage-${side}`,tenant_enabled:true,enabled:true}, 'PUT');
  await expect('member cannot configure Heritage', '/api/heritage/configuration', 'member-a', 403, {}, 'PUT');
  const tree = await json('member: create private synthetic tree', '/api/heritage/trees', 'member-a', 201, {community_id:'community-stage-a',name:'STAGING private family'});
  const ownTree = await json('owner: own private tree', '/api/heritage/tree?community_id=community-stage-a', 'member-a');
  assert.ok(ownTree.people.some(p => p.person_id === tree.person_id));
  assert.deepEqual((await json('other community member: private people hidden', '/api/heritage/tree?community_id=community-stage-a', 'multi-member')).people, []);
  await expect('foreign member: Heritage scope denied', '/api/heritage/tree?community_id=community-stage-a', 'member-b', 404);
  await expect('private person: public endpoint denied', '/api/heritage/public/'+tree.person_id, null, 404);
  await expect('foreign member: private profile update denied', '/api/heritage/people/'+tree.person_id, 'member-b', 404, {}, 'PUT');
  for (const side of ['b','a']) assert.deepEqual((await json(`multi-member: Heritage switch ${side}`, `/api/heritage/tree?community_id=community-stage-${side}`, 'multi-member')).people, []);

  const billing = await json('member: payment configuration unavailable', '/api/cycle/billing', 'member-a');
  assert.equal(billing.ready, false); assert.equal(billing.recurringReady, false); assert.equal(billing.topUpsEnabled, false);
  for (const purpose of ['wallet-top-up','subscription']) await expect(`payment: ${purpose} fails closed`, '/api/cycle/billing', 'member-a', 503, {purpose,communityId:'community-stage-a',amountCents:100});
  await expect('legacy wallet top-up cannot create credits', '/api/platform/wallet/top-up', 'member-a', 409, {amount:100});
  assert.deepEqual((await json('no payment requests created', '/api/cycle/requests', 'member-a')).requests, []);

  await json('platform: revoke tenant-a staff', '/api/tenant-access/tenant-stage-a/staff/staff-stage-a', 'platform', 200,
    {permissions:['reports.view','tenant.view','branding.manage','communities.view','users.manage'],status:'revoked'}, 'PUT');
  await expect('revoked staff: reports denied immediately', '/api/community-reports?communityId=community-stage-a', 'tenant-a', 403);
  await expect('revoked staff: staff directory denied immediately', '/api/tenant-access/tenant-stage-a/staff', 'tenant-a', 403);
  assert.ok((await json('revoked staff: no editable branding', '/api/branding', 'tenant-a')).every(b => !b.canEdit));
  completed = true;
} finally {
  for (const [name] of tokens) {
    await expect(`${name}: logout`, '/api/auth/logout', name, 204, {});
    await expect(`${name}: revoked identity`, '/api/auth/me', name, 401);
    await expect(`${name}: revoked MFA status`, '/api/auth/mfa/status', name, 401);
  }
  const report = { kind:stagingKind, completed, at:new Date().toISOString(), passed:checks.length, checks, liveDataTouched:false, paymentConfigurationChanged:false, realPaymentsAttempted:false };
  writeFileSync(path.join(root,'permission-check.results.json'), JSON.stringify(report,null,2));
}
console.log(JSON.stringify({ passed:checks.length, environment:stagingKind, realPaymentsAttempted:false, liveDataTouched:false }));

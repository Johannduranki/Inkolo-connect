import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createPlatformRouter } from '../src/platform-api.js';
import { canReadUpload } from '../src/upload-security.js';

async function harness(t) {
  const state = {
    users: [
      { id: 'provider', status: 'active', roles: ['Service Provider User'] },
      { id: 'member', status: 'active', roles: ['Member'] },
      { id: 'admin', status: 'active', roles: ['Platform Admin'] }
    ],
    importedCommunities: [
      { id: 'a', name: 'A', tenantId: 'tenant-a', tenantName: 'A' },
      { id: 'b', name: 'B', tenantId: 'tenant-b', tenantName: 'B' }
    ],
    providerAccessGrants: [{ userId: 'provider', serviceProviderId: 'one', tenantId: 'tenant-a', communityId: 'a', serviceCodes: ['funeral-cover'], status: 'active' }],
    memberDocuments: [
      { id: 'allowed', tenantId: 'tenant-a', communityId: 'a', serviceProviderId: 'one', serviceId: 'funeral-cover' },
      { id: 'other-tenant', tenantId: 'tenant-b', communityId: 'b', serviceProviderId: 'one', serviceId: 'funeral-cover' },
      { id: 'other-provider', tenantId: 'tenant-a', communityId: 'a', serviceProviderId: 'two', serviceId: 'funeral-cover' },
      { id: 'other-service', tenantId: 'tenant-a', communityId: 'a', serviceProviderId: 'one', serviceId: 'wallet' },
      { id: 'unscoped', serviceProviderId: 'one', serviceId: 'funeral-cover' }
    ].map(document => ({ ...document, memberId: 'member', fileUrl: `/uploads/member-documents/${document.id}.pdf` }))
  };
  const app = express();
  app.use(createPlatformRouter({ requireAuth: (req, res, next) => { req.auth = { sub: req.get('x-test-user') }; next(); },
    readPlatformState: () => state, updatePlatformState: () => { throw Error('Read checks must not write.'); } }));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ message: 'Rejected' }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { state, workspace: (user = 'provider', extra = '') => fetch(`http://127.0.0.1:${server.address().port}/service-provider/workspace${extra}`, { headers: { 'x-test-user': user } }), get: (user = 'provider', provider = 'one', extra = '') =>
    fetch(`http://127.0.0.1:${server.address().port}/service-provider/documents?serviceProviderId=${provider}${extra}`, { headers: { 'x-test-user': user } }) };
}

test('provider workspace exposes only current own scopes and documents without mutating state', async t => {
  const h = await harness(t), before = structuredClone(h.state);
  const response = await h.workspace('provider', '?userId=admin&tenantId=tenant-b');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  assert.equal(result.scopes.length, 1);
  assert.equal(result.scopes[0].communityId, 'a');
  assert.equal(result.scopes[0].serviceProviderId, 'one');
  assert.equal(result.scopes[0].userId, undefined);
  assert.deepEqual(result.documents.map(row => row.id), ['allowed']);
  assert.equal((await h.workspace('member')).status, 403);
  assert.equal((await h.workspace('unknown')).status, 403);
  assert.deepEqual(h.state, before);
});

test('provider workspace clears after grant revocation, user deactivation or scope reparenting', async t => {
  const h = await harness(t);
  h.state.providerAccessGrants[0].status = 'revoked';
  assert.deepEqual(await (await h.workspace()).json(), { scopes: [], documents: [] });
  h.state.providerAccessGrants[0].status = 'active';
  h.state.users[0].status = 'inactive';
  assert.deepEqual(await (await h.workspace()).json(), { scopes: [], documents: [] });
  h.state.users[0].status = 'active';
  h.state.importedCommunities[0].tenantId = 'tenant-b';
  assert.deepEqual(await (await h.workspace()).json(), { scopes: [], documents: [] });
});

test('provider workspace includes multiple assigned providers but never invents admin grants', async t => {
  const h = await harness(t);
  h.state.providerAccessGrants.push({ ...h.state.providerAccessGrants[0], serviceProviderId: 'two' });
  const result = await (await h.workspace()).json();
  assert.deepEqual(result.scopes.map(row => row.serviceProviderId), ['one', 'two']);
  assert.deepEqual(result.documents.map(row => row.id), ['allowed', 'other-provider']);
  assert.deepEqual(await (await h.workspace('admin')).json(), { scopes: [], documents: [] });
});

test('provider document route filters each scope dimension and ignores forged query authority', async t => {
  const h = await harness(t), before = structuredClone(h.state);
  const result = await h.get('provider', 'one', '&userId=admin&tenantId=tenant-b&roles=Platform%20Admin');
  assert.equal(result.status, 200);
  assert.deepEqual((await result.json()).map(row => row.id), ['allowed']);
  assert.deepEqual(await (await h.get('provider', 'two')).json(), []);
  assert.equal((await h.get('member')).status, 403);
  assert.equal((await h.get('unknown')).status, 403);
  assert.deepEqual(h.state, before);
});

test('provider document route loses access immediately after grant or scope revocation', async t => {
  const h = await harness(t);
  h.state.providerAccessGrants[0].status = 'revoked';
  assert.deepEqual(await (await h.get()).json(), []);
  h.state.providerAccessGrants[0].status = 'active';
  h.state.importedCommunities[0].tenantId = 'tenant-b';
  assert.deepEqual(await (await h.get()).json(), []);
  h.state.users[0].roles = ['Member'];
  assert.equal((await h.get()).status, 403);
  assert.equal(h.state.memberDocuments.length, 5);
});

test('private download policy matches provider document visibility without granting other files', async t => {
  const h = await harness(t), provider = h.state.users[0], member = h.state.users[1];
  for (const doc of h.state.memberDocuments) {
    const relative = doc.fileUrl.slice('/uploads'.length);
    assert.equal(canReadUpload(h.state, provider, relative), doc.id === 'allowed');
    assert.equal(canReadUpload(h.state, member, relative), true);
  }
  h.state.providerAccessGrants[0].status = 'revoked';
  assert.equal(canReadUpload(h.state, provider, '/member-documents/allowed.pdf'), false);
  assert.equal(canReadUpload(h.state, member, '/member-documents/allowed.pdf'), true);
  assert.equal(canReadUpload(h.state, member, '/member-documents/missing.pdf'), false);
});

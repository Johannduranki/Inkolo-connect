import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('provider uploads reauthorize queued saves and remove only rejected temporary files', async t => {
  const previous = process.cwd();
  const directory = mkdtempSync(path.join(tmpdir(), 'duranki-provider-queue-'));
  process.chdir(directory);
  t.after(() => {
    process.chdir(previous);
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('duranki-provider-queue-'));
    rmSync(directory, { recursive: true });
  });
  // Import after selecting the isolated upload directory. No live store is used.
  const { createPlatformRouter } = await import('../src/platform-api.js');
  let state, beforeWrite;
  const reset = () => {
    state = { users: [
      { id: 'provider', status: 'active', roles: ['Service Provider User'] },
      { id: 'member', status: 'active', roles: ['Member'] }
    ], importedCommunities: [{ id: 'community', name: 'Test', tenantId: 'tenant', tenantName: 'Test' }],
    memberCommunities: [{ memberId: 'member', communityId: 'community', tenantId: 'tenant' }],
    providerAccessGrants: [{ userId: 'provider', serviceProviderId: 'provider-one', tenantId: 'tenant', communityId: 'community', serviceCodes: ['funeral-cover'], status: 'active' }],
    memberDocuments: [] };
    beforeWrite = () => {};
  };
  reset();
  const app = express();
  app.use(createPlatformRouter({ requireAuth: (req, res, next) => { req.auth = { sub: 'provider' }; next(); },
    readPlatformState: () => state, updatePlatformState: async fn => {
      beforeWrite(); const draft = structuredClone(state), result = fn(draft); state = draft; return result;
    } }));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ message: 'Rejected' }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const upload = () => {
    const body = new FormData();
    body.append('file', new Blob(['%PDF-1.7\nSynthetic permission test\n%%EOF'], { type: 'application/pdf' }), 'synthetic.pdf');
    for (const [key, value] of Object.entries({ memberId: 'member', serviceId: 'funeral-cover', serviceProviderId: 'provider-one' })) body.append(key, value);
    return fetch(`http://127.0.0.1:${server.address().port}/service-provider/documents`, { method: 'POST', body });
  };
  const files = () => readdirSync(path.join(directory, 'uploads/member-documents'));
  for (const change of [
    () => { state.users[0].roles = ['Member']; },
    () => { state.users[0].status = 'inactive'; },
    () => { state.users[1].status = 'inactive'; },
    () => { state.providerAccessGrants[0].status = 'revoked'; },
    () => { state.memberCommunities = []; },
    () => { state.importedCommunities[0].tenantId = 'other'; }
  ]) {
    reset(); beforeWrite = change;
    assert.ok([400, 403].includes((await upload()).status));
    assert.equal(state.memberDocuments.length, 0);
    assert.deepEqual(files(), []);
  }
  reset(); assert.equal((await upload()).status, 201);
  assert.equal(state.memberDocuments[0].tenantId, 'tenant');
  const keptFiles = files(); assert.equal(keptFiles.length, 1);
  beforeWrite = () => { state.providerAccessGrants[0].status = 'revoked'; };
  assert.equal((await upload()).status, 403);
  assert.deepEqual(files(), keptFiles);
  assert.equal(state.memberDocuments.length, 1);
});

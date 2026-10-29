import test from 'node:test';
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { authenticator } from '@otplib/v12-adapter';
import { startApi } from './http-harness.js';

test('MariaDB HTTP registration, privacy, password login, MFA and restart persistence', { timeout: 120000 }, async t => {
  let api = await startApi();
  t.after(async () => { await api.stop(); });
  const phone = `06${randomInt(10000000, 99999998)}`;
  const otherPhone = String(Number(phone) + 1).padStart(10, '0');
  const password = 'synthetic-password-for-http-tests';
  const document = Buffer.from('%PDF-1.4\nSynthetic identity fixture, not a real document.');
  const request = (path, { token, body, ...options } = {}) => fetch(api.url + '/api' + path, {
    ...options, signal: AbortSignal.timeout(15000),
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body)
  });
  const json = async (path, options, status = 200) => {
    const response = await request(path, options);
    const text = await response.text();
    assert.equal(response.status, status, `${path}: ${text}`);
    return JSON.parse(text);
  };
  const form = (telephoneNumber, consent = true, attach = true) => {
    const data = new FormData();
    for (const [name, value] of Object.entries({ telephoneNumber, firstName: 'Synthetic', lastName: 'HttpFixture',
      password, idNumber: '9001015009087', dateOfBirth: '1990-01-01', gender: 'Female', privacyAccepted: String(consent),
      address: '123 Synthetic Test Street', city: 'Pretoria', region: 'Gauteng', postalCode: '0001', country: 'South Africa' })) data.append(name, value);
    if (attach) data.append('idDocument', new Blob([document], { type: 'application/pdf' }), 'synthetic.pdf');
    return data;
  };
  const register = body => json('/auth/register', { method: 'POST', body }, 201);
  const login = (pass = password) => json('/auth/login', { method: 'POST', body: { telephoneNumber: phone, password: pass } }, pass === password ? 200 : 401);
  const health = await json('/health');
  assert.equal(health.accountStorage, 'platform-document');
  for (const name of ['storage', 'authenticationStorage', 'platformStorage', 'walletStorage', 'treasuryStorage', 'trainingStorage', 'cycleStorage', 'heritageStorage']) assert.equal(health[name], 'mariadb', name);

  await json('/auth/register', { method: 'POST', body: form(phone, false) }, 400);
  const account = await register(form(phone));
  assert.ok(account.accessToken);
  const token = account.accessToken;
  const profile = await json('/platform/profile', { token });
  assert.equal(profile.region, 'Gauteng'); assert.equal(profile.city, 'Pretoria');
  const directory = await json('/community-registration', { token });
  const trader = directory.communities.find(c => c.name === 'Trader Connect');
  assert.equal(trader.tenantName, 'Inkolo Connect');
  await json('/community-registration', { method: 'POST', token, body: { communityId: trader.id } }, 201);
  await json('/platform/profile', { method: 'PUT', token, body: { region: 'Western Cape', city: 'Cape Town' } });
  const updatedProfile = await json('/platform/profile', { token });
  assert.equal(updatedProfile.address, '123 Synthetic Test Street');
  assert.equal(updatedProfile.region, 'Western Cape');
  assert.equal((await json('/community-registration', { token })).communities.length, directory.communities.length);
  const details = await json('/auth/registration-details', { token });
  assert.equal(details.idNumber, '9001015009087');
  assert.equal(details.dateOfBirth, '1990-01-01');
  assert.equal(details.gender, 'Female');
  assert.equal(details.privacy.accepted, true);
  assert.ok(Number.isFinite(Date.parse(details.privacy.acceptedAt)));
  assert.match(details.privacy.policySha256, /^[a-f0-9]{64}$/);
  const checkDocument = async token => {
    const response = await request('/auth/registration-document', { token });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition'), /^attachment/);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), document);
  };
  await checkDocument(token);
  for (const path of ['/auth/registration-document', '/auth/registration-details']) assert.equal((await request(path)).status, 401);
  await json('/auth/register', { method: 'POST', body: form(phone) }, 409);
  const other = await register(form(otherPhone, true, false));
  assert.equal((await request(`/auth/registration-document?userId=${account.user.id}`, { token: other.accessToken })).status, 404);
  await login('incorrect-synthetic-password');
  const signedIn = await login();
  assert.equal(String(signedIn.user.id), String(account.user.id));
  assert.notEqual(signedIn.mfaRequired, true);

  await api.stop(); api = await startApi();
  assert.deepEqual(await json('/platform/profile', { token }), updatedProfile);
  const memberships = await json('/platform/community/me/all', { token });
  assert.equal(memberships.filter(m => m.communityName === 'Trader Connect').length, 1);
  assert.equal(memberships.find(m => m.communityName === 'Trader Connect').tenantId, 'tenant-inkolo');
  assert.deepEqual(await json('/auth/registration-details', { token }), details);
  await checkDocument(token);
  await login();
  await json('/auth/register', { method: 'POST', body: form(phone) }, 409);
  assert.equal((await request('/auth/logout', { method: 'POST', token: signedIn.accessToken })).status, 204);
  assert.equal((await request('/auth/me', { token: signedIn.accessToken })).status, 401);

  await api.promoteFixture(account.user.id, phone);
  assert.equal((await request('/auth/me', { token })).status, 403);
  const challenge = await login();
  assert.equal(challenge.mfaRequired, true);
  assert.equal((await request('/auth/registration-details', { token: challenge.accessToken })).status, 403);
  const setup = await json('/auth/mfa/setup', { method: 'POST', token: challenge.accessToken, body: {} });
  assert.match(setup.qr, /^data:image\/png/);
  await json('/auth/mfa/verify', { method: 'POST', token: challenge.accessToken, body: { code: 'invalid-code' } }, 400);
  const verified = await json('/auth/mfa/verify', { method: 'POST', token: challenge.accessToken, body: { code: authenticator.generate(setup.secret) } });
  assert.equal(verified.recoveryCodes.length, 8);
  await json('/auth/me', { token: verified.accessToken });
  const report = await json('/community-reports?communityId=' + trader.id, { token: verified.accessToken });
  const reportedMember = report.members.find(m => String(m.id) === String(account.user.id));
  assert.equal(reportedMember.region, 'Western Cape');
  assert.equal(reportedMember.city, 'Cape Town');
  assert.equal(Object.hasOwn(reportedMember, 'address'), false);
  await json('/auth/mfa/verify', { method: 'POST', token: challenge.accessToken, body: { code: authenticator.generate(setup.secret) } }, 401);

  await api.stop(); api = await startApi();
  await json('/auth/me', { token: verified.accessToken });
  assert.equal((await request('/auth/me', { token: signedIn.accessToken })).status, 401);
  const next = await login();
  assert.equal(next.mfaRequired, true);
  const status = await json('/auth/mfa/status', { token: next.accessToken });
  assert.equal(status.enrolled, true);
  assert.equal(status.verified, false);
  const recovered = await json('/auth/mfa/verify', { method: 'POST', token: next.accessToken, body: { code: verified.recoveryCodes[0] } });
  await checkDocument(recovered.accessToken);
  const replay = await login();
  await json('/auth/mfa/verify', { method: 'POST', token: replay.accessToken, body: { code: verified.recoveryCodes[0] } }, 400);

  await api.disconnectDatabase();
  assert.equal((await request('/health')).status, 503);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, passwordPolicy, verifyPassword } from '../src/password-security.js';
import { listingChanges, listingCreation, ownedListing } from '../src/listing-security.js';
import { signToken, verifyToken } from '../src/token-security.js';
import { validateProduction } from '../src/production-security.js';
import { validateGlobalRoleChange } from '../src/role-security.js';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { validFileBytes, canReadUpload } from '../src/upload-security.js';
import { SessionStore } from '../src/session-security.js';

test('password verification rejects absent credentials and short new passwords', async () => {
  for (const value of [undefined, null, '', '1234', { password: 'long enough password' }]) assert.equal(passwordPolicy(value), false);
  assert.equal(await verifyPassword('any-password', undefined), false);
  assert.equal(await verifyPassword(undefined, 'invalid'), false);
  await assert.rejects(hashPassword('1234'));
});

test('new credentials are salted and require the correct password', async () => {
  const password = 'test-only long passphrase';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('incorrect password', first), false);
  assert.equal(await verifyPassword(password, 'scrypt-v1:bad:bad'), false);
});

test('listing updates reject identity, ownership, prototype and financial manipulation', () => {
  for (const kind of ['job', 'marketplace']) {
    for (const field of ['id', 'sellerUserId', 'listedByUserId', 'tenantId', 'communityId', 'roles', 'createdAt', '__proto__']) {
      assert.throws(() => listingChanges(kind, JSON.parse(`{"${field}":"attacker"}`)));
    }
    assert.throws(() => listingChanges(kind, { status: 'ADMIN' }));
  }
  for (const price of [-1, NaN, Infinity, '100']) assert.throws(() => listingChanges('marketplace', { price }));
  assert.throws(() => listingChanges('marketplace', { images: ['javascript:alert(1)'] }));
  assert.deepEqual(listingChanges('job', { status: 'FILLED' }), { status: 'FILLED' });
});

test('changing a listing ID cannot return another owner record', () => {
  const rows = [{ id: 'one', sellerUserId: 'a' }, { id: 'two', sellerUserId: 'b' }];
  assert.equal(ownedListing(rows, 'two', 'sellerUserId', 'a'), undefined);
  assert.equal(ownedListing(rows, 'one', 'sellerUserId', 'a'), rows[0]);
});

test('listing creation ignores spoofed ownership, scope and ratings while validating editable fields', () => {
  for (const kind of ['marketplace','job']) {
    const valid = kind === 'marketplace' ? {title:'Item',price:10} : {title:'Job'};
    const input = {...valid,id:'forged',sellerUserId:'other',listedByUserId:'other',tenantId:'other',communityId:'other',sellerRating:5,listerRating:5,roles:['Platform Admin'],status:'SOLD'};
    assert.deepEqual(listingCreation(kind,input),valid);
    assert.throws(()=>listingCreation(kind,{...valid,title:''}),{status:400});
  }
  assert.throws(()=>listingCreation('marketplace',{title:'Item',price:1,images:['javascript:alert(1)']}),{status:400});
  assert.throws(()=>listingCreation('marketplace',{title:'Item',price:-1}),{status:400});
});

test('upload signatures must match the MIME and extension', () => {
  const pdf = Buffer.from('%PDF-1.7\nfixture');
  assert.equal(validFileBytes(pdf, 'file.pdf', 'application/pdf'), true);
  assert.equal(validFileBytes(pdf, 'file.html', 'application/pdf'), false);
  assert.equal(validFileBytes(Buffer.from('<html>payload</html>'), 'file.pdf', 'application/pdf'), false);
  assert.equal(validFileBytes(Buffer.from('<svg onload="x"/>'), 'image.svg', 'image/svg+xml'), false);
});

test('private file access requires an active owner or platform administrator', () => {
  const state = { memberDocuments: [{ fileUrl: '/uploads/member-documents/test.pdf', memberId: 'a' }] };
  const member = { id: 'a', status: 'active', roles: ['Member'] };
  assert.equal(canReadUpload(state, member, '/member-documents/test.pdf'), true);
  assert.equal(canReadUpload(state, { ...member, id: 'b' }, '/member-documents/test.pdf'), false);
  assert.equal(canReadUpload(state, { ...member, status: 'inactive' }, '/member-documents/test.pdf'), false);
  assert.equal(canReadUpload(state, member, '/../test.pdf'), false);
});

test('session revocation, owner checks and idle expiry reject old tokens', () => {
  let now = 1000000;
  const store = new SessionStore(':memory:', () => now);
  try {
    const claims = { jti: 'test-session', sub: 'a', exp: (now + 7200000) / 1000 };
    store.register(claims);
    assert.equal(store.allowed(claims), true);
    assert.equal(store.allowed({ ...claims, sub: 'b' }), false);
    now += 1800001;
    assert.equal(store.allowed(claims, false), false);
    const next = { ...claims, jti: 'next-session' };
    store.register(next);
    store.revoke(next.jti);
    assert.equal(store.allowed(next), false);
    const third = { ...claims, jti: 'third-session' };
    store.register(third);
    store.revokeUser('a');
    assert.equal(store.allowed(third), false);
  } finally { store.close(); }
});

test('tokens reject expiry, wrong issuer/audience, algorithms, malformed and manipulated claims', () => {
  const secret = randomBytes(32).toString('hex');
  assert.equal(verifyToken(signToken({ sub: 'test-user' }, secret, '5m'), secret).sub, 'test-user');
  assert.throws(() => verifyToken(signToken({ sub: 'test-user' }, secret, -1), secret));
  for (const options of [{ issuer: 'other', audience: 'duranki-api' }, { issuer: 'duranki', audience: 'other' }, { issuer: 'duranki', audience: 'duranki-api', algorithm: 'HS384' }]) {
    assert.throws(() => verifyToken(jwt.sign({ sub: 'test-user', jti: 'test' }, secret, { expiresIn: '5m', ...options }), secret));
  }
  assert.throws(() => verifyToken('not-a-token', secret));
  const token = signToken({ sub: 'test-user' }, secret, '5m').split('.');
  token[1] = Buffer.from(JSON.stringify({ sub: 'admin' })).toString('base64url');
  assert.throws(() => verifyToken(token.join('.'), secret));
});

test('global roles cannot be self-promoted or assigned by a tenant administrator', () => {
  for (const role of ['Member', 'Tenant Staff', 'Admin User']) {
    assert.throws(() => validateGlobalRoleChange({ id: 'a', status: 'active', roles: [role] }, 'b', ['Platform Admin']));
  }
  const admin = { id: 'a', status: 'active', roles: ['Platform Admin'] };
  assert.throws(() => validateGlobalRoleChange(admin, 'a', ['Member']));
  assert.throws(() => validateGlobalRoleChange(admin, 'b', ['Invented role']));
  assert.deepEqual(validateGlobalRoleChange(admin, 'b', ['Member']), ['Member']);
});

test('production refuses root, demo authentication, short secrets and insecure origins', () => {
  const env = { NODE_ENV: 'production', JWT_SECRET: randomBytes(32).toString('hex'), ID_PEPPER: randomBytes(32).toString('hex'), DB_USER: 'app', DB_PASSWORD: randomBytes(20).toString('hex'), FRONTEND_ORIGIN: 'https://duranki.test' };
  assert.doesNotThrow(() => validateProduction(env));
  for (const patch of [{ DB_USER: 'root' }, { ALLOW_DEMO_AUTH: 'true' }, { JWT_SECRET: 'short' }, { FRONTEND_ORIGIN: '*' }, { FRONTEND_ORIGIN: 'http://duranki.test' }]) assert.throws(() => validateProduction({ ...env, ...patch }));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanConfirmedFixtures } from '../src/mock-data-cleanup.js';

test('cleanup retains imported and local accounts, credentials and financial records', () => {
  const input = { users: [{ id: 21 }, { id: 1000001, passwordHash: 'keep' }, { id: 200001, importSource: 'duranki-core' }], churches: [{ id: '1' }, { id: 'community-zuc' }], memberCommunities: [{ memberId: 21, churchId: '1' }, { memberId: 200001, communityId: 'community-zuc' }], availableLifts: [{ id: 'lift-001' }], rideRequests: [{ liftId: 'lift-001' }], jobListings: [{ id: 'job-001' }, { id: 'real-job' }], wallets: [{ id: 'member-21', balance: 500 }], walletTransactions: [{ id: 'real-payment', amount: 500 }], serviceSubscriptions: [{ userId: 21 }] };
  const { state } = cleanConfirmedFixtures(input);
  for (const key of ['users', 'wallets', 'walletTransactions', 'serviceSubscriptions']) assert.deepEqual(state[key], input[key]);
  assert.equal(state.memberCommunities.length, 1);
  assert.deepEqual(state.jobListings, [{ id: 'real-job' }]);
  assert.equal(state.rideRequests.length, 0);
  assert.equal(input.churches.length, 2);
  assert.equal(state.realDataOnly, true);
  assert.deepEqual(cleanConfirmedFixtures(state).state, state);
});

test('import provenance protects even a colliding fixture identifier', () => {
  const { state } = cleanConfirmedFixtures({ users: [], churches: [{ id: '1', importSource: 'duranki-core' }], memberCommunities: [{ churchId: '1' }] });
  assert.equal(state.churches.length, 1);
  assert.equal(state.memberCommunities.length, 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { acknowledgeReferral } from '../src/referral-security.js';

const fixture = () => ({ users: [
  { id: 'sender', status: 'active', telephoneNumber: '0600000001' },
  { id: 'recipient', status: 'active', telephoneNumber: '+27600000002' }
], referrals: [{ id: 'ref', referredPhone: '0600000002', status: 'PENDING' }] });

test('only the active recipient can answer a referral', () => {
  for (const actor of ['sender', 'unknown']) {
    const state = fixture();
    assert.throws(() => acknowledgeReferral(state, actor, 'ref', true), { status: 404 });
    assert.equal(state.referrals[0].status, 'PENDING');
  }
  const state = fixture();
  state.users[1].status = 'inactive';
  assert.throws(() => acknowledgeReferral(state, 'recipient', 'ref', true), { status: 404 });
});

test('referral responses validate input and cannot reverse an earlier decision', () => {
  const state = fixture();
  assert.throws(() => acknowledgeReferral(state, 'recipient', 'ref', 'false'), { status: 400 });
  const response = acknowledgeReferral(state, 'recipient', 'ref', true);
  const timestamp = response.acknowledgedAt;
  assert.equal(response.status, 'ACCEPTED');
  assert.equal(acknowledgeReferral(state, 'recipient', 'ref', true).acknowledgedAt, timestamp);
  assert.throws(() => acknowledgeReferral(state, 'recipient', 'ref', false), { status: 409 });
});

test('duplicate or missing phone numbers cannot authorize legacy referral ownership', () => {
  const state = fixture();
  state.users.push({ ...state.users[1], id: 'duplicate' });
  assert.throws(() => acknowledgeReferral(state, 'recipient', 'ref', true), { status: 404 });
  state.users[1].telephoneNumber = '';
  state.referrals[0].referredPhone = '';
  assert.throws(() => acknowledgeReferral(state, 'recipient', 'ref', true), { status: 404 });
});

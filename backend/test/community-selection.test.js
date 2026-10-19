import test from 'node:test';
import assert from 'node:assert/strict';
import { selectMemberCommunity } from '../src/community-selection.js';

const memberships = [
  { memberId: '1', churchId: 'trader-ilembe', churchName: 'Traders KZN' },
  { memberId: '1', churchId: 'community-zuc', churchName: 'ZUC Community' },
  { memberId: '2', churchId: 'other' }
];
test('selected community takes precedence over first membership in both directions', () => {
  assert.equal(selectMemberCommunity(memberships, 1, 'community-zuc').churchName, 'ZUC Community');
  assert.equal(selectMemberCommunity(memberships, 1, 'trader-ilembe').churchName, 'Traders KZN');
});
test('unknown and other users communities never fall back to the first record', () => {
  assert.equal(selectMemberCommunity(memberships, 1, 'missing'), null);
  assert.equal(selectMemberCommunity(memberships, 1, 'other'), null);
});
test('default selection preserves primary membership and does not mutate records', () => {
  const before = JSON.stringify(memberships);
  assert.equal(selectMemberCommunity(memberships, 1).churchName, 'Traders KZN');
  assert.equal(selectMemberCommunity([...memberships, { memberId: '1', churchId: 'primary', isPrimary: true }], 1).churchId, 'primary');
  assert.equal(JSON.stringify(memberships), before);
});

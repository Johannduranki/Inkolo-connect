import test from 'node:test';
import assert from 'node:assert/strict';
import { membershipPayment } from '../../frontend/public/community-membership-payment.js';
const now = Date.parse('2026-10-29T00:00:00Z');
const fixture = () => ({ ready: false, recurringReady: false, communities: [{ id: 'community', aliases: ['legacy'], services: [{ code: 'community-membership', mode: 'paid', amountCents: 500 }] }], subscriptions: [] });
test('unpaid joined community offers a scoped payment link, not activation', () => {
  const result = membershipPayment(fixture(), 'legacy', now);
  assert.equal(result.url, '/payments/cycle?service=community-membership&communityId=community');
  assert.equal(result.ready, false);
  assert.equal(membershipPayment(fixture(), 'other', now), null);
});
test('free, unconfigured and unknown prices do not request payment', () => {
  for (const mode of ['free', 'unconfigured']) {
    const data = fixture(); data.communities[0].services[0].mode = mode;
    assert.equal(membershipPayment(data, 'community', now), null);
  }
});
test('only live unexpired membership for this community suppresses the prompt', () => {
  const data = fixture();
  const sub = { community_id: 'community', service_code: 'community-membership', mode: 'live', state: 'ACTIVE', paid_until: '2026-11-29T00:00:00Z' };
  data.subscriptions = [sub];
  assert.equal(membershipPayment(data, 'community', now), null);
  sub.state = 'CANCELLED';
  assert.equal(membershipPayment(data, 'community', now), null);
  for (const change of [{mode:'sandbox'}, {community_id:'other'}, {paid_until:'2026-09-01'}, {service_code:'funeral-cover'}]) {
    data.subscriptions = [{...sub, ...change}];
    assert.ok(membershipPayment(data, 'community', now));
  }
});

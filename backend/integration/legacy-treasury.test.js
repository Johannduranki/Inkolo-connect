import { isolatedStore } from './isolated-stores.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { TreasuryStore } from '../src/treasury-store.js';
async function setup(t) {
    const s = await isolatedStore(t, TreasuryStore, 'treasury');
    await s.addScope('scope', { tenant_id: 'tenant', tenant_name: 'Tenant', community_id: 'community', community_name: 'Community' }, 'fixture');
    await s.addParty('party', { name: 'Funeral provider', service_id: 'funeral', beneficiary_reference: 'BEN-1', share_bps: 8000 }, 'fixture');
    return s;
}
async function receipt(s, reference = 'REF-1') {
    return await s.receipt({ scope_id: 'scope', party_id: 'party', user_id: 'member', member_name: 'Test Member', reference, received_cents: 10000, received_on: '2026-09-01' }, 'maker');
}
test('receipt allocation and duplicate source reference enforcement', async (t) => {
    const s = await setup(t);
    await receipt(s);
    assert.equal((await s.snapshot()).receipts[0].payable_cents, 8000);
    await assert.rejects(async () => await receipt(s));
    assert.equal((await s.snapshot()).receipts.length, 1);
});
test('duplicate payment allocation rolls back and preserves first payment', async (t) => {
    const s = await setup(t), id = await receipt(s);
    await s.draft([id], 'maker');
    await assert.rejects(async () => await s.draft([id], 'maker'));
    assert.equal((await s.snapshot()).payments.length, 1);
});
test('maker cannot approve; settlement needs approval and unique bank reference', async (t) => {
    const s = await setup(t), id = await s.draft([await receipt(s)], 'maker');
    await assert.rejects(async () => await s.transition(id, 'approve', 'maker'));
    await assert.rejects(async () => await s.transition(id, 'settle', 'checker', 'BANK-1', '2026-09-02'));
    await s.transition(id, 'approve', 'checker');
    await assert.rejects(async () => await s.transition(id, 'settle', 'checker', '', '2026-09-02'));
    await s.transition(id, 'settle', 'checker', 'BANK-1', '2026-09-02');
    assert.equal((await s.snapshot()).payments[0].status, 'SETTLED');
    const second = await s.draft([await receipt(s, 'REF-2')], 'maker');
    await s.transition(second, 'approve', 'checker');
    await assert.rejects(async () => await s.transition(second, 'settle', 'checker', 'BANK-1', '2026-09-02'));
});
test('cancelled drafts release receipts and approved payments cannot be cancelled', async (t) => {
    const s = await setup(t), r = await receipt(s), p = await s.draft([r], 'maker');
    await s.transition(p, 'cancel', 'maker');
    assert.equal((await s.snapshot()).receipts[0].status, 'UNALLOCATED');
    const p2 = await s.draft([r], 'maker');
    await s.transition(p2, 'approve', 'checker');
    await assert.rejects(async () => await s.transition(p2, 'cancel', 'maker'));
});
test('empty drafts and invalid amounts are rejected', async (t) => {
    const s = await setup(t);
    await assert.rejects(async () => await s.draft([], 'maker'));
    await assert.rejects(async () => await s.receipt({ received_cents: 0 }, 'maker'));
    await assert.rejects(async () => await s.receipt({ received_cents: 1.5 }, 'maker'));
});

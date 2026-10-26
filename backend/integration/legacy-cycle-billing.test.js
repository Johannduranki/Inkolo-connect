import { isolatedStore } from './isolated-stores.js';
import { MysqlCycleBilling } from '../src/mysql-cycle-billing.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { CycleStore, cycleConfig } from '../src/cycle-pay.js';
import { billingConfig, billingTerms, nextMonth } from '../src/cycle-billing.js';
import express from 'express';
import { createCycleRouter } from '../src/cycle-api.js';
async function fixture(t, mode = 'live') {
    const store = await isolatedStore(t, CycleStore, 'cycle');
    let time = '2026-01-31T12:00:00.000Z';
    const config = () => cycleConfig({ CYCLE_ENABLED: 'true', CYCLE_MODE: mode, CYCLE_LIVE_APPROVED: 'true', CYCLE_PAYWALL_SECRET: 'test', CYCLE_NOTIFICATION_SECRET: 'test', CYCLE_PUBLIC_URL: 'https://example.test' });
    const settings = () => billingConfig({ CYCLE_RECURRING_ENABLED: 'true', CYCLE_API_CALLER_NAME: 'test', CYCLE_API_CALLER_PASSWORD: 'test', CYCLE_API_BASE_URL: 'https://api.cyclepay.net/api/v3', CYCLE_PROFILE_ID_PATH: 'paymentProfileId', CYCLE_TOKEN_ENCRYPTION_KEY: '11'.repeat(32), CYCLE_WALLET_TOPUPS_ENABLED: 'true' });
    const state = { users: [{ id: '2', status: 'active' }], importedCommunities: [{ id: 'legacy', platformCommunityId: 'community-a', tenantId: 'tenant-a', tenantName: 'A', name: 'A' }], memberCommunities: [{ memberId: '2', communityId: 'legacy', tenantId: 'tenant-a' }], wallets: [{ id: 'w', ownerType: 'MEMBER', ownerId: '2', balance: 10, availableBalance: 10 }], walletTransactions: [], servicePricing: { 'community-membership': { mode: 'paid', amountCents: 2500, revision: 1 } }, cycleServiceAvailability: { tenants: [{ id: 'tenant-a', status: 'active', serviceCodes: ['wallet', 'community-membership'] }], communities: [{ id: 'community-a', tenantId: 'tenant-a', status: 'active', serviceCodes: ['wallet', 'community-membership'] }] } };
    const calls = [];
    const billing = new MysqlCycleBilling({ store, readState: () => state, updateState: fn => fn(state), config, settings, now: () => time, fetcher: async (...args) => { calls.push(args); return { ok: true }; } });
    const start = async (purpose = 'subscription', extra = {}) => await billing.start('2', { purpose, communityId: 'legacy', serviceCode: 'community-membership', amountCents: 2500, priceRevision: 1, accepted: true, termsVersion: billingTerms, idempotencyKey: randomUUID(), ...extra });
    const pay = async (row, extra = {}) => { const event = { id: row.id, internalId: 'provider-' + row.id, merchantAccount: 'Duranki', status: 'CHARGED', lineItem: { amount: row.amount_cents / 100, currency: 'ZAR' }, transactions: [{ type: 'CHARGE', state: 'APPROVED', amount: row.amount_cents / 100, currency: 'ZAR' }], paymentProfileId: 'private-token', ...extra }; const raw = Buffer.from(JSON.stringify(event)); await store.notify(raw, createHmac('sha256', 'test').update(raw).digest('hex'), config()); await billing.fulfil(row.id, event); return event; };
    return { store, billing, state, start, pay, calls, setTime: v => time = v };
}
test('billing defaults disabled and calendar months clamp correctly', () => { assert.equal(billingConfig({}).recurringReady, false); assert.equal(billingConfig({}).topUpsEnabled, false); assert.equal(nextMonth('2026-01-31T12:00:00.000Z'), '2026-02-28T12:00:00.000Z'); });
test('subscription checks membership, availability, terms and server price', async (t) => { const f = await fixture(t); await assert.rejects(async () => await f.start('subscription', { communityId: 'other' }), { status: 403 }); await assert.rejects(async () => await f.start('subscription', { amountCents: 1 }), { status: 409 }); await assert.rejects(async () => await f.start('subscription', { accepted: false }), { status: 400 }); f.state.cycleServiceAvailability.tenants[0].serviceCodes = []; await assert.rejects(async () => await f.start(), { status: 403 }); assert.equal((await f.store.list()).length, 0); });
test('initial checkout saves a payment profile without collecting card data in Duranki', async (t) => { const f = await fixture(t), row = await f.start(); const checkout = JSON.parse((await f.billing.checkout(row.id, '2')).payload); assert.equal(checkout.savePaymentProfile, true); assert.equal(checkout.recurrence.type, 'INITIAL'); assert.equal(checkout.price, '25.00'); await assert.rejects(async () => await f.billing.checkout(row.id, '3'), { status: 404 }); assert.equal((await f.billing.active('2')).length, 0); });
test('verified payment activates only the matching community and encrypts token', async (t) => { const f = await fixture(t), row = await f.start(); await f.pay(row); assert.equal((await f.billing.active('2', 'community-a')).length, 1); assert.equal((await f.billing.active('2', 'community-b')).length, 0); assert.equal((await f.billing.active('3', 'community-a')).length, 0); assert.equal((await f.billing.list('2'))[0].paid_until, '2026-02-28T12:00:00.000Z'); assert(!JSON.stringify(await f.billing.list('2')).includes('private-token')); assert(!(await f.store.fixtureQuery('SELECT token FROM cycle_subscription'))[0].token.includes('private-token')); await f.pay(row); assert.equal((await f.billing.list('2')).length, 1); });
test('wallet top-ups are exactly once and sandbox cannot credit live balances', async (t) => { for (const mode of ['live', 'sandbox']) {
    const f = await fixture(t, mode), row = await f.start('wallet-top-up');
    await f.pay(row);
    await f.pay(row);
    assert.equal(f.state.wallets[0].balance, mode === 'live' ? 35 : 10);
    assert.equal(f.state.walletTransactions.length, mode === 'live' ? 1 : 0);
} });
test('sandbox subscriptions never grant live access', async (t) => { const f = await fixture(t, 'sandbox'), row = await f.start(); await f.pay(row); assert.equal((await f.billing.active('2')).length, 0); });
test('payment keys are idempotent but cannot change purpose or amount', async (t) => { const f = await fixture(t), key = randomUUID(), row = await f.start('wallet-top-up', { idempotencyKey: key }); assert.equal((await f.start('wallet-top-up', { idempotencyKey: key })).id, row.id); await assert.rejects(async () => await f.start('wallet-top-up', { idempotencyKey: key, amountCents: 1000 }), { status: 409 }); assert.equal((await f.store.list()).length, 1); });
test('cancellation during asynchronous eligibility prevents renewal dispatch', async (t) => {
    const f = await fixture(t);
    await f.pay(await f.start());
    f.setTime('2026-03-01T00:00:00.000Z');
    let release, entered;
    const eligibility = new Promise(resolve => { entered = resolve; });
    f.billing.serviceReady = () => new Promise(resolve => { release = resolve; entered(); });
    const pending = f.billing.renewDue();
    await eligibility;
    await f.billing.cancel('2', (await f.billing.list('2'))[0].id);
    release(true);
    assert.deepEqual(await pending, { submitted: 0 });
    assert.equal(f.calls.length, 0);
    assert.equal((await f.store.fixtureQuery('SELECT COUNT(*) AS n FROM cycle_dispatch'))[0].n, 0);
});
test('membership or service revocation during eligibility prevents payment creation', async (t) => {
    for (const revoke of [f => { f.state.memberCommunities = []; }, f => { f.state.cycleServiceAvailability.tenants[0].serviceCodes = []; }, f => { f.state.users[0].status = 'inactive'; }]) {
        const f = await fixture(t);
        let release;
        f.billing.serviceReady = () => new Promise(resolve => { release = resolve; });
        const pending = f.start();
        revoke(f);
        release(true);
        await assert.rejects(pending, { status: 403 });
        assert.equal((await f.store.list()).length, 0);
    }
});
test('membership or service revocation during eligibility prevents renewals', async (t) => {
    for (const revoke of [f => { f.state.memberCommunities = []; }, f => { f.state.cycleServiceAvailability.tenants[0].serviceCodes = []; }, f => { f.state.users[0].status = 'inactive'; }]) {
        const f = await fixture(t);
        await f.pay(await f.start());
        f.setTime('2026-03-01T00:00:00.000Z');
        let release, entered;
        const eligibility = new Promise(resolve => { entered = resolve; });
        f.billing.serviceReady = () => new Promise(resolve => { release = resolve; entered(); });
        const pending = f.billing.renewDue();
        await eligibility;
        revoke(f);
        release(true);
        assert.deepEqual(await pending, { submitted: 0 });
        assert.equal(f.calls.length, 0);
    }
});
test('cancel preserves paid access but disables renewal and checkout', async (t) => { const f = await fixture(t), row = await f.start(); await f.pay(row); const s = (await f.billing.list('2'))[0]; await assert.rejects(async () => await f.billing.cancel('3', s.id), { status: 404 }); await f.billing.cancel('2', s.id); assert.equal((await f.billing.active('2')).length, 1); f.setTime('2026-03-01T00:00:00.000Z'); assert.equal((await f.billing.active('2')).length, 0); await f.billing.renewDue(); assert.equal(f.calls.length, 0); });
test('renewals dispatch once, require verified notification, and stop on price change', async (t) => { const f = await fixture(t), row = await f.start(); await f.pay(row); f.setTime('2026-03-01T00:00:00.000Z'); await f.billing.renewDue(); await f.billing.renewDue(); assert.equal(f.calls.length, 1); assert.equal((await f.billing.active('2')).length, 0); const body = JSON.parse(f.calls[0][1].body); assert.equal(body.recurrence.type, 'RENEWAL'); assert.equal(body.payment.storedPaymentProfileId, 'private-token'); const renewal = await f.store.request(body.id); await assert.rejects(async () => await f.billing.checkout(renewal.id, '2'), { status: 409 }); await f.pay(renewal); assert.equal((await f.billing.active('2')).length, 1); f.setTime('2026-04-02T00:00:00.000Z'); f.state.servicePricing['community-membership'].revision = 2; await f.billing.renewDue(); assert.equal(f.calls.length, 1); });
test('ambiguous renewal failures are not resubmitted', async (t) => { const f = await fixture(t); await f.pay(await f.start()); f.setTime('2026-03-01T00:00:00.000Z'); let calls = 0; f.billing.fetcher = async () => { calls++; throw Error('timeout'); }; await f.billing.renewDue(); await f.billing.renewDue(); assert.equal(calls, 1); assert.equal((await f.store.fixtureQuery('SELECT state FROM cycle_dispatch'))[0].state, 'REVIEW'); });
test('refund review revokes access and cannot be bypassed by cancellation', async (t) => { const f = await fixture(t), row = await f.start(); await f.pay(row); await f.pay(row, { status: 'REFUNDED' }); assert.equal((await f.billing.active('2')).length, 0); await f.billing.cancel('2', (await f.billing.list('2'))[0].id); assert.equal((await f.billing.active('2')).length, 0); const wallet = await f.start('wallet-top-up'); await f.pay(wallet); await f.pay(wallet, { status: 'CHARGED_BACK' }); assert.equal(f.state.cycleWalletReview['2'], true); });
test('disabled collection creates no payment or subscription', async (t) => { const f = await fixture(t); f.billing.config = () => cycleConfig({}); await assert.rejects(async () => await f.start(), { status: 503 }); assert.equal((await f.store.list()).length, 0); assert.equal((await f.billing.list('2')).length, 0); });
test('HTTP member payment flow protects identity, signatures and configuration', async (t) => {
    const f = await fixture(t);
    f.state.users.push({ id: '1', status: 'active', roles: ['Platform Admin'] });
    const app = express();
    app.use('/cycle/notifications', express.raw({ type: 'application/json' }));
    app.use(express.json());
    app.use('/cycle', createCycleRouter({ store: f.store, billing: f.billing, config: f.billing.config, readState: () => f.state, requireAuth: (req, res, next) => { if (!req.get('x-user'))
            return res.sendStatus(401); req.auth = { sub: req.get('x-user') }; next(); }, resolveUser: async (id) => f.state.users.find(u => u.id === id) }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(r => server.once('listening', r));
    t.after(() => { server.closeAllConnections(); server.close(); });
    const call = (path, user, body, method = body ? 'POST' : 'GET', extra = {}) => fetch(`http://127.0.0.1:${server.address().port}/cycle${path}`, { method, headers: { 'Content-Type': 'application/json', 'x-user': user || '', ...extra }, body: body ? JSON.stringify(body) : undefined });
    assert.equal((await call('/billing')).status, 401);
    assert.equal((await call('/availability', '2', { tenants: [], communities: [] }, 'PUT')).status, 403);
    const body = { purpose: 'subscription', userId: '1', communityId: 'legacy', serviceCode: 'community-membership', amountCents: 2500, priceRevision: 1, accepted: true, termsVersion: billingTerms, idempotencyKey: randomUUID() };
    const response = await call('/billing', '2', body);
    assert.equal(response.status, 201);
    const row = await response.json();
    assert.equal(row.user_id, '2');
    const checkout = await (await call('/requests/' + row.id + '/checkout', '2', {})).json();
    assert.equal(JSON.parse(checkout.payload).recurrence.type, 'INITIAL');
    assert.equal((await call('/requests/' + row.id + '/checkout', '1', {})).status, 404);
    assert.equal((await call('/notifications', '2', { id: row.id, status: 'CHARGED' })).status, 403);
    assert.equal((await f.billing.active('2')).length, 0);
    const event = { id: row.id, status: 'CHARGED', internalId: 'real-fixture', merchantAccount: 'Duranki', lineItem: { currency: 'ZAR', amount: 25 }, transactions: [{ type: 'CHARGE', state: 'APPROVED', currency: 'ZAR', amount: 25 }], paymentProfileId: 'profile-fixture' };
    const signature = createHmac('sha256', 'test').update(JSON.stringify(event)).digest('hex');
    assert.equal((await call('/notifications', null, event, 'POST', { 'x-callback-signature': signature })).status, 200);
    assert.equal((await f.billing.active('2', 'community-a')).length, 1);
    const safe = await (await call('/billing', '2')).text();
    assert(!safe.includes('profile-fixture'));
    assert(!safe.includes('private-token'));
});

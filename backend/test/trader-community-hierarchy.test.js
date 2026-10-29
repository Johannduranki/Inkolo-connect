import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateTraderCommunity, inkoloTenantId, legacyTraderTenantId, traderCommunityId, hierarchyVersion } from '../src/trader-community-hierarchy.js';
import { tenantDirectory, permissionsFor, communityPermissions } from '../src/tenant-access.js';
import { joinableCommunities, registerCommunityMember } from '../src/community-registration.js';
import { trainingCommunities, trainingMember } from '../src/trader-training.js';
import { canTeach, seedStudyDrafts, studyView, studyReport } from '../src/study-modules.js';
import { communityReport, reportCommunities } from '../src/community-reports.js';
import { effectiveServicePrice, serviceEnabled, serviceScope, canConfigureServices } from '../src/service-scope.js';
import { memberLocation, locationForMember } from '../src/member-location.js';
import { communityHierarchy } from '../../frontend/public/community-hierarchy.js';
import { heritageScopes } from '../src/heritage-api.js';
import { paidWholesaleAccess, wholesaleView } from '../src/wholesaler-orders.js';
import { memberCommunityRows, selectMemberCommunity } from '../src/community-selection.js';

function fixture() {
  return {
    users: [{ id: 'learner', status: 'active', roles: ['Member'] }, { id: 'other', status: 'active', roles: ['Member'] }, { id: 'trainer', status: 'active', roles: ['Member'] }],
    profiles: [{ userId: 'learner', address: 'Private synthetic address', region: 'Gauteng', city: 'Pretoria' }],
    importedCommunities: [{ id: 'trader-ilembe', platformCommunityId: traderCommunityId, tenantId: legacyTraderTenantId, tenantName: 'Trader Connect', name: 'Traders KZN' }, { id: 'inkolo-other', tenantId: inkoloTenantId, tenantName: 'Inkolo', name: 'Other' }],
    memberCommunities: [{ memberId: 'learner', tenantId: legacyTraderTenantId, communityId: 'trader-ilembe' }, { memberId: 'other', tenantId: inkoloTenantId, communityId: 'inkolo-other' }],
    tenantStaff: [{ userId: 'trainer', tenantId: legacyTraderTenantId, status: 'active', permissions: ['training.manage', 'services.manage', 'reports.view', 'users.manage'] }],
    cycleServiceAvailability: { tenants: [{ id: legacyTraderTenantId, serviceCodes: ['trader-training'] }, { id: inkoloTenantId, serviceCodes: ['wallet'] }], communities: [{ id: traderCommunityId, tenantId: legacyTraderTenantId, serviceCodes: ['trader-training'] }, { id: 'inkolo-other', tenantId: inkoloTenantId, serviceCodes: ['trader-training', 'wallet'] }] },
    servicePricing: { 'trader-training': { mode:'paid', amountCents: 100, revision: 1 } },
    tenantServicePricing: { [legacyTraderTenantId]: { 'trader-training': { amountCents: 250, revision: 2, enabled: true } } },
    serviceSubscriptions: [{ userId: 'learner', tenantId: legacyTraderTenantId, communityId: 'trader-ilembe', serviceCode: 'trader-training', amountCents: 250, status: 'active' }],
    wallets: [{ ownerId: 'learner', balance: 12345 }]
  };
}
test('one community under Inkolo, repeatable migration preserves IDs, balances and historical agreements', () => {
  const s = fixture(), money = structuredClone([s.wallets, s.serviceSubscriptions]);
  seedStudyDrafts(s);
  const modules = structuredClone(s.trainingStudyModules);
  assert.equal(migrateTraderCommunity(s), true);
  assert.ok(!tenantDirectory(s).some(t => t.id === legacyTraderTenantId));
  const c = joinableCommunities(s).find(c => c.id === traderCommunityId);
  assert.equal(c.tenantId, inkoloTenantId); assert.equal(c.name, 'Trader Connect');
  assert.equal(s.memberCommunities[0].communityId, 'trader-ilembe');
  assert.equal(s.memberCommunities[0].tenantId, inkoloTenantId);
  assert.deepEqual([s.wallets, s.serviceSubscriptions], money);
  assert.deepEqual(s.trainingStudyModules, modules);
  const before = JSON.stringify(s); assert.equal(migrateTraderCommunity(s), false); assert.equal(JSON.stringify(s), before);
  assert.ok(s.hierarchyMigrations[hierarchyVersion].snapshot);
});
test('region never creates a tenant or community and address edits preserve missing fields', () => {
  const s = fixture(); migrateTraderCommunity(s);
  assert.deepEqual(memberLocation({ region: '  Western  Cape ' }, { address: 'Keep address', city: 'Cape Town' }), { address: 'Keep address', city: 'Cape Town', region: 'Western Cape', postalCode: '', country: '' });
  assert.throws(() => memberLocation({ region: {} }), { status: 400 });
  assert.throws(() => memberLocation({ city: 'x'.repeat(101) }), { status: 400 });
  assert.equal(registerCommunityMember(s, 'learner', traderCommunityId).alreadyMember, true);
  registerCommunityMember(s, 'other', traderCommunityId);
  assert.equal(joinableCommunities(s).filter(c => c.name === 'Trader Connect').length, 1);
  assert.deepEqual(locationForMember(s, 'other'), { region: '', city: '' });
});
test('legacy trainer retains Trader training and community permissions without access to sibling communities', () => {
  const s = fixture(); seedStudyDrafts(s); migrateTraderCommunity(s);
  const trainer = s.users.find(u => u.id === 'trainer'), c = trainingCommunities(s)[0];
  assert.equal(trainingCommunities(s).length, 1); assert.equal(trainingMember(s, 'learner', c), true);
  assert.equal(trainingMember(s, 'other', c), false);
  assert.deepEqual(permissionsFor(s, trainer, inkoloTenantId), []);
  assert.equal(communityPermissions(s, trainer, c).includes('users.manage'), false);
  assert.equal(canTeach(s, trainer, legacyTraderTenantId), true);
  assert.equal(studyView(s, 'learner', legacyTraderTenantId).member, true);
  assert.throws(() => studyView(s, 'other', legacyTraderTenantId), { status: 403 });
  assert.deepEqual(studyReport(s, 'trainer', legacyTraderTenantId).members.map(m => m.id), ['learner']);
  assert.equal(canConfigureServices(s, trainer, inkoloTenantId), false);
  assert.equal(canConfigureServices(s, trainer, inkoloTenantId, c), false);
  assert.equal(reportCommunities(s, trainer).length, 1);
  s.tenantStaff[0].status = 'revoked'; assert.equal(canTeach(s, trainer, legacyTraderTenantId), false);
});
test('preserves old prices but applies Duranki settings across communities', () => {
  const s = fixture(); migrateTraderCommunity(s);
  const scope = serviceScope(s, { communityId: 'trader-ilembe' });
  assert.equal(effectiveServicePrice(s, 'trader-training', scope).amountCents, 100);
  assert.equal(serviceEnabled(s, scope.community, 'trader-training'), true);
  assert.equal(serviceEnabled(s, { id: 'inkolo-other', tenantId: inkoloTenantId }, 'trader-training'), true);
});
test('reports include legacy financial scope and region but never expose street addresses', () => {
  const s = fixture(); migrateTraderCommunity(s);
  const c = trainingCommunities(s)[0];
  const charge = { community_id: 'trader-ilembe', tenant_id: legacyTraderTenantId, mode: 'live', user_id: 'learner', status: 'CHARGED', charged_at: '2026-01-01', amount_cents: 250, currency: 'ZAR' };
  const r = communityReport(s, c, [charge, { ...charge, tenant_id: 'private-other' }], [], '2026-01-01', '2026-12-31');
  assert.equal(r.members[0].region, 'Gauteng'); assert.equal(r.members[0].city, 'Pretoria');
  assert.equal(r.members[0].services.length, 1); assert.equal(r.payments.length, 1);
  assert.doesNotMatch(JSON.stringify(r), /Private synthetic address/);
});
test('workspace combines regions into one community, preserving unrelated tenants', () => {
  const config = communityHierarchy([{ id: legacyTraderTenantId }, { id: 'tenant-other' }], [{ id: 'region-a', tenantId: legacyTraderTenantId }, { id: 'region-b', tenantId: legacyTraderTenantId }]);
  assert.equal(config.communities.length, 1); assert.equal(config.communities[0].tenantId, inkoloTenantId);
  assert.ok(config.communities[0].aliases.includes('region-b')); assert.ok(config.tenants.some(t => t.id === 'tenant-other'));
});

test('multiple old regional memberships appear once and old links still resolve without deleting records', () => {
  const s = fixture();
  s.importedCommunities.push({ id: 'old-region', tenantId: legacyTraderTenantId, name: 'Old region' });
  s.memberCommunities.push({ memberId: 'learner', tenantId: legacyTraderTenantId, communityId: 'old-region', isPrimary: true });
  migrateTraderCommunity(s);
  const rows = memberCommunityRows(s.memberCommunities, 'learner');
  assert.equal(rows.length, 1); assert.equal(rows[0].isPrimary, true);
  assert.equal(selectMemberCommunity(rows, 'learner', 'old-region').communityName, 'Trader Connect');
  assert.equal(selectMemberCommunity(rows, 'learner', traderCommunityId).communityName, 'Trader Connect');
  assert.equal(s.memberCommunities.length, 3);
});

test('existing heritage and wholesale records keep their internal storage scope, not Inkolo-wide access', () => {
  const s = fixture(); delete s.cycleServiceAvailability;
  s.wholesalerOrders = { suppliers: [{ id: 'supplier', tenantId: legacyTraderTenantId, active: true }], offers: [], orders: [], groups: [], applications: [], audit: [] };
  migrateTraderCommunity(s);
  assert.equal(heritageScopes(s).find(c => c.community_id === 'trader-ilembe').tenant_id, legacyTraderTenantId);
  assert.equal(wholesaleView(s, 'learner', '', 'trader-ilembe').suppliers.length, 1);
  assert.equal(wholesaleView(s, 'trainer', legacyTraderTenantId).suppliers.length, 1);
  assert.throws(() => wholesaleView(s, 'trainer', inkoloTenantId), { status: 403 });
  const sub = { serviceCode: 'marketplace', tenantId: inkoloTenantId, communityId: traderCommunityId, provider: 'cycle', status: 'active', amountCents: 100, paidUntil: '2030-01-01' };
  assert.equal(paidWholesaleAccess([sub], legacyTraderTenantId, 'trader-ilembe', new Date('2026-01-01'), s), true);
  assert.equal(paidWholesaleAccess([{ ...sub, communityId: 'inkolo-other' }], legacyTraderTenantId, 'trader-ilembe', new Date('2026-01-01'), s), false);
});

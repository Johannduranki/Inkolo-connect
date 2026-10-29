import { communityHierarchy, inkoloTenantId, legacyTraderTenantId, traderCommunityId, traderMemberCommunityId } from '../../frontend/public/community-hierarchy.js';
export { inkoloTenantId, legacyTraderTenantId, traderCommunityId, traderMemberCommunityId };
export const hierarchyVersion = 'trader-community-v1';
export function traderAliases(state) {
  return state.hierarchyMigrations?.[hierarchyVersion]?.aliases || [];
}
// Existing service tables keep their storage namespace; it is not a tenant grant.
export function serviceStorageTenant(state, tenantId, communityId) {
  return tenantId === inkoloTenantId && traderAliases(state).includes(communityId) ? legacyTraderTenantId : tenantId;
}

export function migrateTraderCommunity(state) {
  if (state.hierarchyMigrations?.[hierarchyVersion]) return false;
  const oldCommunities = (state.importedCommunities || []).filter(c => c.tenantId === legacyTraderTenantId);
  const directoryRows = (state.brandingDirectory || []).filter(c => c.kind === 'community' && c.tenantId === legacyTraderTenantId);
  const communityIds = new Set([traderCommunityId, traderMemberCommunityId,
    ...[...oldCommunities, ...directoryRows].flatMap(c => [c.id, c.platformCommunityId, ...(c.aliases || [])]).filter(Boolean)]);
  const policy = state.cycleServiceAvailability;
  const snapshot = structuredClone({ importedCommunities: oldCommunities, directoryRows,
    tenantAccessDirectory: state.tenantAccessDirectory || [], policy: policy || null,
    tenantPrices: state.tenantServicePricing?.[legacyTraderTenantId] || {},
    communityPrices: state.communityServicePricing || {} });
  const source = oldCommunities[0] || (state.importedCommunities || []).find(c => communityIds.has(c.id) && c.tenantId === inkoloTenantId) || { id: traderMemberCommunityId, type: 'Traders' };
  state.importedCommunities = [...(state.importedCommunities || []).filter(c => c.tenantId !== legacyTraderTenantId && !communityIds.has(c.id)),
    { ...source, id: traderMemberCommunityId, platformCommunityId: traderCommunityId, aliases: [...communityIds],
      tenantId: inkoloTenantId, tenantName: 'Inkolo Connect', name: 'Trader Connect', region: '', town: '' }];
  state.tenantAccessDirectory = (state.tenantAccessDirectory || []).filter(t => t.id !== legacyTraderTenantId);
  const parent = state.tenantAccessDirectory.find(t => t.id === inkoloTenantId);
  if (parent) parent.name = 'Inkolo Connect';
  else state.tenantAccessDirectory.push({ id: inkoloTenantId, name: 'Inkolo Connect' });
  state.brandingDirectory = (state.brandingDirectory || []).filter(c => c.id !== legacyTraderTenantId && !(c.kind === 'community' && (communityIds.has(c.id) || c.tenantId === legacyTraderTenantId)));
  for (const membership of state.memberCommunities || []) {
    if (membership.tenantId !== legacyTraderTenantId && !((!membership.tenantId || membership.tenantId === inkoloTenantId) && communityIds.has(membership.communityId || membership.churchId))) continue;
    membership.previousTenantId ??= membership.tenantId;
    membership.tenantId = inkoloTenantId;
    membership.platformCommunityId = traderCommunityId;
    membership.communityName = membership.churchName = 'Trader Connect';
  }
  for (const church of state.churches || []) if (communityIds.has(church.id)) {
    church.name = 'Trader Connect'; church.tenantId = inkoloTenantId;
  }
  if (policy) {
    const normalized = communityHierarchy(policy.tenants, policy.communities);
    // Preserve previously disabled services in other Inkolo communities when adding parent capabilities.
    const oldParent = policy.tenants?.find(t => t.id === inkoloTenantId);
    const newParent = normalized.tenants.find(t => t.id === inkoloTenantId);
    const added = (newParent?.serviceCodes || []).filter(c => !oldParent?.serviceCodes?.includes(c));
    for (const community of normalized.communities.filter(c => c.tenantId === inkoloTenantId && c.id !== traderCommunityId)) {
      for (const code of added) {
        const settings = ((state.communityServicePricing ??= {})[community.id] ??= {});
        if (settings[code]?.enabled == null) settings[code] = { ...settings[code], inheritPrice: settings[code]?.inheritPrice ?? true, enabled: false };
      }
    }
    state.cycleServiceAvailability = { ...policy, ...normalized };
  }
  const target = ((state.communityServicePricing ??= {})[traderCommunityId] ??= {});
  for (const [code, setting] of Object.entries(state.tenantServicePricing?.[legacyTraderTenantId] || {})) {
    if (!target[code] || target[code].inheritPrice) target[code] = { ...setting, inheritPrice: setting.inheritPrice === true,
      enabled: target[code]?.enabled ?? setting.enabled };
  }
  // Historical financial rows and course IDs remain unchanged. Legacy staff retain only
  // community-scoped access, never an automatic grant over all Inkolo communities.
  (state.hierarchyMigrations ??= {})[hierarchyVersion] = { at: new Date().toISOString(), snapshot, aliases: [...communityIds] };
  return true;
}

export async function ensureTraderCommunity({ readState, updateState }) {
  if (!readState().hierarchyMigrations?.[hierarchyVersion]) await updateState(migrateTraderCommunity);
}

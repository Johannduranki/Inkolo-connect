export const inkoloTenantId = 'tenant-inkolo';
export const legacyTraderTenantId = 'tenant-trader-connect';
// Keep existing identifiers so bookmarks, subscriptions and training records survive.
export const traderCommunityId = 'community-ilembe-traders';
export const traderMemberCommunityId = 'trader-ilembe';
export const isTraderCommunity = row => row?.tenantId === legacyTraderTenantId ||
  [traderCommunityId, traderMemberCommunityId].includes(row?.id);

export function communityHierarchy(tenants = [], communities = []) {
  const traders = communities.filter(isTraderCommunity);
  const oldTenant = tenants.find(t => t.id === legacyTraderTenantId);
  const parent = tenants.find(t => t.id === inkoloTenantId);
  const canonical = traders.find(c => c.id === traderCommunityId) || traders[0];
  const result = tenants.filter(t => t.id !== legacyTraderTenantId).map(t => t.id === inkoloTenantId ? {
    ...t, name: 'Inkolo Connect', serviceCodes: [...new Set([...(t.serviceCodes || []), ...(oldTenant?.serviceCodes || [])])]
  } : t);
  if (!parent && (oldTenant || canonical)) result.push({ id: inkoloTenantId, name: 'Inkolo Connect', status: 'Active', serviceCodes: oldTenant?.serviceCodes || [] });
  const children = communities.filter(c => !isTraderCommunity(c));
  if (canonical) children.push({ ...canonical, id: traderCommunityId, tenantId: inkoloTenantId,
    tenantName: 'Inkolo Connect', name: 'Trader Connect', region: '', town: '',
    description: 'Trader Connect community of Inkolo Connect.',
    aliases: [...new Set([traderMemberCommunityId, ...traders.flatMap(c => [c.id, c.platformCommunityId, ...(c.aliases || [])]).filter(Boolean)])],
    serviceCodes: [...new Set(traders.flatMap(c => c.serviceCodes || []))] });
  return { tenants: result, communities: children };
}

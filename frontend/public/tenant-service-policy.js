// Presentation policy only. API permissions must be enforced independently.
export function resolveCommunityConfiguration(member, communities, tenants) {
  const aliases = { 'trader-ilembe': 'community-ilembe-traders' };
  const id = member?.communityId || member?.churchId;
  if (!id || !Array.isArray(communities) || !Array.isArray(tenants)) return null;
  const community = communities.find(item => item.id === id || item.id === aliases[id]);
  if (!community) return null;
  const tenant = tenants.find(item => item.id === community.tenantId);
  if (!tenant) return { ...community, serviceCodes: [] };
  const active = item => !['inactive', 'disabled', 'archived'].includes(String(item.status).toLowerCase());
  const canonical = code => ({'catch-a-ride':'deliveries',transport:'deliveries','build-up-balance':'marketplace','job-search':'jobs',funeral:'funeral-cover',eduu:'education','uif-trader-training':'trader-training',membership:'community-membership'})[code] || code;
  const services = active(community) && active(tenant) && Array.isArray(tenant.serviceCodes) && Array.isArray(community.serviceCodes)
    ? community.serviceCodes.filter(code => tenant.serviceCodes.some(tenantCode => canonical(tenantCode) === canonical(code))) : [];
  return { ...community, serviceCodes: services };
}

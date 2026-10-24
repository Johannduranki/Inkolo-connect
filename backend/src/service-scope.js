import { tenantDirectory, permissionsFor, platformAdmin } from './tenant-access.js';
import { joinableCommunities, findMembership } from './community-registration.js';
const fail = (status, message) => { throw Object.assign(Error(message), { status }); };
const canonical = code => ({'build-up-balance':'marketplace','job-search':'jobs',funeral:'funeral-cover',eduu:'education','catch-a-ride':'deliveries',transport:'deliveries','uif-trader-training':'trader-training',membership:'community-membership'})[code] || code;
export function serviceScope(state, input = {}) {
  let tenantId = input.tenantId || '', communityId = input.communityId || '';
  if (typeof tenantId !== 'string' || typeof communityId !== 'string') fail(400, 'Choose a tenant and community.');
  let community;
  if (communityId) {
    community = joinableCommunities(state).find(c => c.id === communityId || c.aliases?.includes(communityId));
    if (!community || (tenantId && community.tenantId !== tenantId)) fail(403, 'Community does not belong to this tenant.');
    tenantId = community.tenantId; communityId = community.id;
  }
  if (tenantId && !tenantDirectory(state).some(t => t.id === tenantId)) fail(404, 'Tenant not found.');
  return { tenantId, communityId, community, level: communityId ? 'community' : tenantId ? 'tenant' : 'platform' };
}
export function canConfigureServices(state, user, tenantId) {
  if (platformAdmin(user)) return true;
  if (!tenantId) return false;
  const permissions = permissionsFor(state, user, tenantId);
  return permissions.includes('services.manage') || permissions.includes('users.manage');
}
export function canReadServiceScope(state, user, scope) {
  return !scope.tenantId || canConfigureServices(state, user, scope.tenantId) || (scope.community && !!findMembership(state, user.id, scope.community));
}
export function memberServiceScope(state, userId, communityId) {
  const memberships = (state.memberCommunities || []).filter(m => String(m.memberId) === String(userId));
  const membership = memberships.find(m => m.isPrimary) || memberships[0];
  const selected = communityId || membership?.communityId || membership?.churchId;
  if (!selected) return serviceScope(state);
  const scope = serviceScope(state, { communityId: selected });
  if (!findMembership(state, userId, scope.community)) fail(403, 'Join the selected community first.');
  return scope;
}
export function ownServiceSetting(state, code, scope) {
  if (scope.communityId) return state.communityServicePricing?.[scope.communityId]?.[code];
  if (scope.tenantId) return state.tenantServicePricing?.[scope.tenantId]?.[code];
  return state.servicePricing?.[code];
}
export function effectiveServicePrice(state, code, context = {}) {
  const base = state.servicePricing?.[code];
  const tenant = state.tenantServicePricing?.[context.tenantId]?.[code];
  const community = context.communityId ? state.communityServicePricing?.[context.communityId]?.[code] : context.id ? state.communityServicePricing?.[context.id]?.[code] : null;
  let price = base, source = 'platform';
  if (base && tenant && !tenant.inheritPrice) { price = tenant; source = 'tenant'; }
  if (base && community && !community.inheritPrice) { price = community; source = 'community'; }
  if (!price) return undefined;
  return { ...price, source, revision: Math.max(base?.revision || 0, tenant?.revision || 0, community?.revision || 0) };
}
export function serviceEnabled(state, community, code) {
  if (!community) return false;
  const policy = state.cycleServiceAvailability;
  const tenantPolicy = policy?.tenants?.find(t => t.id === community.tenantId);
  const communityPolicy = policy?.communities?.find(c => c.id === community.id || community.aliases?.includes(c.id));
  const tenantSetting = state.tenantServicePricing?.[community.tenantId]?.[code];
  const communitySetting = state.communityServicePricing?.[community.id]?.[code];
  const active = row => !row?.status || ['active', 'configured'].includes(String(row.status).toLowerCase());
  if (!active(tenantPolicy) || !active(communityPolicy) || (communityPolicy && communityPolicy.tenantId !== community.tenantId) || state.servicePricing?.[code]?.enabled === false) return false;
  const includes = row => !!row?.serviceCodes?.some(s => canonical(s) === code);
  const tenantEnabled = tenantSetting?.enabled ?? includes(tenantPolicy);
  const communityEnabled = communitySetting?.enabled ?? includes(communityPolicy);
  return tenantEnabled && communityEnabled;
}
export function storeServiceSetting(state, userId, code, scopeInput, body, price) {
  const scope = serviceScope(state, scopeInput), actor = state.users?.find(u => String(u.id) === String(userId));
  if (!canConfigureServices(state, actor, scope.tenantId)) fail(403, 'Service configuration permission required for this tenant.');
  const previous = ownServiceSetting(state, code, scope);
  if ((previous?.revision || 0) !== body.revision) fail(409, 'Settings changed. Refresh before saving.');
  const parent = effectiveServicePrice(state, code, scope.communityId ? { tenantId: scope.tenantId } : {});
  if (scope.level !== 'platform' && !parent && (body.inheritPrice !== true || body.enabled === true)) fail(409, 'Duranki must configure the service price first.');
  const revisions = [state.servicePricingSequence || 0, ...Object.values(state.servicePricing || {}).map(p => p.revision || 0), ...Object.values(state.tenantServicePricing || {}).flatMap(rows => Object.values(rows).map(p => p.revision || 0)), ...Object.values(state.communityServicePricing || {}).flatMap(rows => Object.values(rows).map(p => p.revision || 0))];
  const revision = Math.max(...revisions) + 1;
  const saved = { ...(body.inheritPrice && scope.level !== 'platform' ? { inheritPrice: true } : price), enabled: body.enabled === undefined ? previous?.enabled ?? (scope.level === 'platform' ? true : null) : body.enabled, revision, updatedAt: new Date().toISOString(), updatedBy: String(userId) };
  state.servicePricingSequence = revision;
  let rows;
  if (scope.communityId) rows = (state.communityServicePricing ??= {})[scope.communityId] ??= {};
  else if (scope.tenantId) rows = (state.tenantServicePricing ??= {})[scope.tenantId] ??= {};
  else rows = state.servicePricing ??= {};
  rows[code] = saved;
  (state.servicePricingAudit ??= []).push({ code, tenantId: scope.tenantId || null, communityId: scope.communityId || null, before: previous || null, after: saved });
  return saved;
}

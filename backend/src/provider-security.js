import { randomUUID } from 'node:crypto';
import { platformAdmin } from './tenant-access.js';
import { joinableCommunities, findMembership } from './community-registration.js';
import { canonicalService, serviceCatalogue } from './service-pricing.js';
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const providerRoles = ['Service Provider Admin', 'Service Provider User'];
const providerService = code => canonicalService(code === 'funeral-cover-001' ? 'funeral-cover' : code);

export function providerGrants(state, actor) {
  actor = (state.users || []).find(user => String(user.id) === String(actor?.id));
  if (actor?.status !== 'active' || !actor.roles?.some(role => providerRoles.includes(role))) return [];
  const communities = joinableCommunities(state);
  return (state.providerAccessGrants || []).filter(grant => grant.status === 'active' && grant.userId === String(actor.id) &&
    communities.some(community => community.id === grant.communityId && community.tenantId === grant.tenantId));
}

export function canAccessProviderDocument(state, actor, document) {
  actor = (state.users || []).find(user => String(user.id) === String(actor?.id));
  if (platformAdmin(actor)) return true;
  return providerGrants(state, actor).some(grant => grant.serviceProviderId === document.serviceProviderId &&
    grant.tenantId === document.tenantId && grant.communityId === document.communityId &&
    grant.serviceCodes.includes(providerService(document.serviceId)));
}

export function providerWorkspace(state, actor) {
  const communities = joinableCommunities(state);
  const scopes = providerGrants(state, actor).map(grant => {
    const community = communities.find(row => row.id === grant.communityId && row.tenantId === grant.tenantId);
    return {
      serviceProviderId: grant.serviceProviderId,
      tenantId: grant.tenantId,
      communityId: grant.communityId,
      communityName: community.name,
      tenantName: community.tenantName || community.tenantId,
      serviceCodes: [...grant.serviceCodes]
    };
  });
  // A workspace never widens its scope based on query parameters or cached roles.
  const documents = (state.memberDocuments || []).filter(document => scopes.some(scope =>
    scope.serviceProviderId === document.serviceProviderId && scope.tenantId === document.tenantId &&
    scope.communityId === document.communityId && scope.serviceCodes.includes(providerService(document.serviceId))
  )).sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)));
  return { scopes, documents };
}

export function providerUploadScope(state, actor, body) {
  actor = (state.users || []).find(user => String(user.id) === String(actor?.id));
  if (actor?.status !== 'active') fail(403, 'Active provider access is required.');
  const serviceCode = providerService(body.serviceId);
  const member = state.users.find(user => String(user.id) === String(body.memberId) && user.status === 'active');
  if (!member || !Object.hasOwn(serviceCatalogue, serviceCode)) fail(400, 'Choose an active member and a valid service.');
  const communities = joinableCommunities(state);
  if (platformAdmin(actor)) {
    const community = communities.find(c => c.id === body.communityId && c.tenantId === body.tenantId);
    if (!community || !findMembership(state, member.id, community) || !/^[a-zA-Z0-9_-]{1,80}$/.test(body.serviceProviderId || '')) fail(400, 'Select the provider and the member\'s tenant and community.');
    return { tenantId: community.tenantId, communityId: community.id, serviceProviderId: body.serviceProviderId };
  }
  const grants = providerGrants(state, actor).filter(grant => grant.serviceProviderId === body.serviceProviderId && grant.serviceCodes.includes(serviceCode) &&
    (!body.communityId || body.communityId === grant.communityId) && (!body.tenantId || body.tenantId === grant.tenantId) &&
    communities.some(c => c.id === grant.communityId && c.tenantId === grant.tenantId && findMembership(state, member.id, c)));
  if (grants.length !== 1) fail(grants.length ? 409 : 403, 'Select an authorized provider, tenant and community for this member.');
  const { tenantId, communityId, serviceProviderId } = grants[0];
  return { tenantId, communityId, serviceProviderId };
}

export function saveProviderGrant(state, actor, body) {
  actor=state.users.find(user=>String(user.id)===String(actor?.id));
  if (!platformAdmin(actor)) fail(403, 'Platform administrator access is required.');
  const allowed = new Set(['userId','serviceProviderId','tenantId','communityId','serviceCodes','status']);
  if (!body || Object.keys(body).some(key => !allowed.has(key))) fail(400, 'Unexpected provider access fields.');
  const user = state.users.find(u => String(u.id) === String(body.userId) && u.status === 'active' && u.roles?.some(role => providerRoles.includes(role)));
  const community = joinableCommunities(state).find(c => c.id === body.communityId && c.tenantId === body.tenantId);
  const services = Array.isArray(body.serviceCodes) ? [...new Set(body.serviceCodes.map(canonicalService))] : [];
  if (!user || !community || !/^[a-zA-Z0-9_-]{1,80}$/.test(body.serviceProviderId || '') || !services.length || services.some(code => !Object.hasOwn(serviceCatalogue, code)) || !['active','revoked'].includes(body.status)) fail(400, 'Choose a valid provider user, scope, services and access status.');
  state.providerAccessGrants ??= [];
  let grant = state.providerAccessGrants.find(g => g.userId === String(user.id) && g.serviceProviderId === body.serviceProviderId && g.tenantId === community.tenantId && g.communityId === community.id);
  if (!grant) { grant = { id: randomUUID(), userId: String(user.id), serviceProviderId: body.serviceProviderId, tenantId: community.tenantId, communityId: community.id }; state.providerAccessGrants.push(grant); }
  grant.serviceCodes = services;
  grant.status = body.status;
  grant.updatedAt = new Date().toISOString();
  (state.securityAudit ??= []).push({ action: 'provider.access.changed', actorId: String(actor.id), grantId: grant.id, status: grant.status, at: grant.updatedAt });
  return grant;
}

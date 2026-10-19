const roles = new Set(['Member', 'Pastor', 'Bishop', 'Admin User', 'Platform Admin', 'DURANKI_ADMIN', 'KZNCC User', 'KZNCC Admin', 'Service Provider Admin', 'Service Provider User']);

export function validateGlobalRoleChange(actor, targetId, requestedRoles) {
  if (actor?.status !== 'active' || !actor.roles?.some(role => ['Platform Admin', 'DURANKI_ADMIN'].includes(role))) {
    throw Object.assign(new Error('Platform administrator access is required to assign global roles.'), { status: 403 });
  }
  if (targetId != null && String(actor.id) === String(targetId)) {
    throw Object.assign(new Error('Another platform administrator must change your roles.'), { status: 403 });
  }
  if (!Array.isArray(requestedRoles) || !requestedRoles.length || requestedRoles.length > roles.size || requestedRoles.some(role => !roles.has(role))) {
    throw Object.assign(new Error('Choose valid global roles. Use scoped administration for tenant and community permissions.'), { status: 400 });
  }
  return [...new Set(requestedRoles)];
}

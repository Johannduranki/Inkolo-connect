// An access exemption is not a subscription or evidence of a payment.
export function communityMembershipAccess(user) {
  const exempt = String(user?.status).toLowerCase() === 'active' &&
    (user?.roles || []).some(role => ['Platform Admin', 'DURANKI_ADMIN'].includes(role));
  return {
    exempt,
    reason: exempt ? 'platform_admin_testing' : null,
    scope: exempt ? 'all_communities' : null
  };
}

// Read current roles for every request; token claims alone never grant finance access.
export async function resolveTreasuryIdentity(id, claims, findUser, store) {
  const user = await findUser(id);
  if (!user || user.status !== 'active') return null;
  if (user.roles?.includes('Platform Admin')) return user;
  const staff = await store.staffById(id);
  if (!staff || staff.version === 'revoked' || claims.treasury !== staff.version ||
      !['Treasury Operator', 'Treasury Approver'].includes(staff.role)) return null;
  return { ...user, roles: [staff.role] };
}

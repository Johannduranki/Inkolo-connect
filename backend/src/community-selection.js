export function memberCommunityRows(memberships, userId) {
  const result = [];
  for (const row of memberships.filter(m => String(m.memberId) === String(userId))) {
    const existing = row.platformCommunityId && result.find(m => m.platformCommunityId === row.platformCommunityId && m.tenantId === row.tenantId);
    if (existing) {
      existing.isPrimary ||= row.isPrimary;
      existing.aliases = [...new Set([...(existing.aliases || []), row.communityId, row.churchId].filter(Boolean))];
    } else result.push({ ...row });
  }
  return result;
}
export function selectMemberCommunity(memberships, userId, communityId) {
  const own = memberships.filter(item => String(item.memberId) === String(userId));
  if (communityId) {
    return own.find(item => [item.churchId, item.communityId, item.platformCommunityId, ...(item.aliases || [])]
      .some(id => id != null && String(id) === communityId)) ?? null;
  }
  return own.find(item => item.isPrimary) ?? own[0] ?? null;
}

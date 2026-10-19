export function selectMemberCommunity(memberships, userId, communityId) {
  const own = memberships.filter(item => String(item.memberId) === String(userId));
  if (communityId) {
    return own.find(item => [item.churchId, item.communityId, item.platformCommunityId]
      .some(id => id != null && String(id) === communityId)) ?? null;
  }
  return own.find(item => item.isPrimary) ?? own[0] ?? null;
}

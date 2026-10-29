export function cancelStoredSubscription(state, userId, serviceCode, communityId, now = new Date().toISOString()) {
  const row = (state.serviceSubscriptions || []).find(s => String(s.userId) === String(userId) && s.serviceCode === serviceCode && (s.communityId || '') === communityId);
  if (!row) throw Object.assign(Error('Subscription not found.'), {status:404});
  row.status = 'cancelled';
  row.cancelledAt ||= now;
  return {cancelled:true, message:'You have unsubscribed from this service. Your records have been retained.'};
}

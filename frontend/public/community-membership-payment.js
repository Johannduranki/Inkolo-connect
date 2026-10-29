// This is a payment prompt only; service authorization remains on the server.
export function membershipPayment(billing, communityId, now = Date.now()) {
  const community = billing?.communities?.find(c => c.id === communityId || c.aliases?.includes(communityId));
  const price = community?.services?.find(s => s.code === 'community-membership');
  if (price?.mode !== 'paid' || !Number.isSafeInteger(price.amountCents) || price.amountCents <= 0) return null;
  const paid = billing.subscriptions?.some(s =>
    s.community_id === community.id && s.service_code === 'community-membership' &&
    s.mode === 'live' && ['ACTIVE', 'CANCELLED'].includes(s.state) &&
    new Date(s.paid_until).getTime() > now);
  if (paid) return null;
  return {
    amount: new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(price.amountCents / 100),
    url: '/payments/cycle?service=community-membership&communityId=' + encodeURIComponent(community.id),
    ready: billing.ready === true && billing.recurringReady === true
  };
}

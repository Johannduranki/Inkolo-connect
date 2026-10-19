const phone = value => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.startsWith('27') && digits.length === 11 ? `0${digits.slice(2)}` : digits;
};

export function acknowledgeReferral(state, userId, referralId, accepted) {
  const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
  if (typeof accepted !== 'boolean') fail(400, 'Choose whether to accept the referral.');
  const user = state.users.find(row => String(row.id) === String(userId) && row.status === 'active');
  const number = phone(user?.telephoneNumber);
  // Legacy referrals identify recipients by phone; ambiguous numbers cannot prove ownership.
  const owners = state.users.filter(row => row.status === 'active' && phone(row.telephoneNumber) === number);
  const referral = number && owners.length === 1 && state.referrals.find(row =>
    row.id === referralId && phone(row.referredPhone) === number);
  if (!referral) fail(404, 'Referral not found.');
  const status = accepted ? 'ACCEPTED' : 'DECLINED';
  if (referral.status === status) return referral;
  if (referral.status !== 'PENDING') fail(409, 'This referral has already been answered.');
  referral.status = status;
  referral.acknowledgedAt = new Date().toISOString();
  return referral;
}

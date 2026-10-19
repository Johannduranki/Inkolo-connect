export function moneyCents(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(value * 100 - cents) > 0.000001) return null;
  return cents;
}

export function transferBalances(sender, recipient, amount) {
  const cents = moneyCents(amount);
  if (cents === null || cents <= 0) throw Object.assign(new Error('Enter an amount with at most two decimal places.'), {status:400});
  if (sender.status !== 'ACTIVE' || recipient.status !== 'ACTIVE' || sender.currency !== 'ZAR' || recipient.currency !== 'ZAR') {
    throw Object.assign(new Error('Both wallets must be active ZAR wallets.'), {status:409});
  }
  const values = [sender.balance, sender.availableBalance, recipient.balance, recipient.availableBalance].map(moneyCents);
  if (values.some(value => value === null) || values[1] > values[0] || values[3] > values[2]) {
    throw Object.assign(new Error('Wallet balances need reconciliation before transferring.'), {status:409});
  }
  if (values[0] < cents || values[1] < cents) throw Object.assign(new Error('Insufficient wallet balance.'), {status:409});
  const next = [values[0] - cents, values[1] - cents, values[2] + cents, values[3] + cents];
  if (!next.every(Number.isSafeInteger)) throw Object.assign(new Error('Transfer exceeds wallet limits.'), {status:409});
  return next.map(value => value / 100);
}

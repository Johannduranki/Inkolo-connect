const fail = message => { throw Object.assign(Error(message), { status: 400 }); };
export function memberLocation(body = {}, previous = {}) {
  const result = {};
  for (const [field, limit] of Object.entries({ address: 500, city: 100, region: 100, postalCode: 20, country: 100 })) {
    const value = body[field] ?? previous[field] ?? '';
    if (typeof value !== 'string' || value.length > limit || /[\x00-\x1f]/.test(value)) fail(`Enter a valid ${field}.`);
    result[field] = value.trim().replace(/\s+/g, ' ');
  }
  return result;
}

export function locationForMember(state, userId) {
  const profile = (state.profiles || []).find(p => String(p.userId) === String(userId));
  // Region is an address attribute, never inferred from a tenant/community name.
  return { region: profile?.region || '', city: profile?.city || '' };
}

import path from 'node:path';

export const stagingKind = 'duranki-isolated-rehearsal-v1';
export const accountSpecs = [
  ['platform', ['Platform Admin', 'Member']],
  ['tenant-a', ['Tenant Staff', 'Member']],
  ['tenant-b', ['Tenant Staff', 'Member']],
  ['member-a', ['Member']],
  ['member-b', ['Member']],
  ['multi-member', ['Member']],
  ['provider-a', ['Service Provider User', 'Member']]
];

export function stagingEnvironment(root, port, secrets, inherited = process.env) {
  if (!Number.isInteger(port) || port < 4300 || port > 4399) throw Error('Use a staging port from 4300 through 4399.');
  if (![secrets.jwt, secrets.pepper].every(s => /^[a-f0-9]{64}$/.test(s))) throw Error('Fresh staging secrets are required.');
  const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE'].filter(k => inherited[k]).map(k => [k, inherited[k]]));
  return { ...env, NODE_ENV: 'test', PORT: String(port), HOST: '127.0.0.1',
    DOTENV_CONFIG_PATH: path.join(root, 'unused.env'),
    DB_HOST: '127.0.0.1', DB_PORT: '9', DB_USER: 'staging_no_database', DB_PASSWORD: secrets.pepper, DB_NAME: 'staging_no_database',
    JWT_SECRET: secrets.jwt, ID_PEPPER: secrets.pepper, JWT_EXPIRES_IN: '1h',
    FRONTEND_ORIGIN: `http://127.0.0.1:${port}`, FRONTEND_ORIGINS: `http://127.0.0.1:${port},http://localhost:${port}`,
    ALLOW_DEMO_AUTH: 'true', FORCE_DEMO_MODE: 'true', PLATFORM_STORAGE: 'json', AUTH_STORAGE: 'sqlite',
    TREASURY_STORAGE: 'sqlite', TRAINING_STORAGE: 'sqlite', CYCLE_STORAGE: 'sqlite', HERITAGE_STORAGE: 'sqlite',
    CYCLE_MODE: 'sandbox', CYCLE_ENABLED: 'false', CYCLE_LIVE_APPROVED: 'false', LOG_DESTINATION: 'stdout' };
}

export function stagingState(accounts) {
  const names = ['Platform', 'TenantAlpha', 'TenantBeta', 'MemberAlpha', 'MemberBeta', 'MemberMultiple', 'ProviderAlpha'];
  const state = { version: 11, realDataOnly: true, demoUsersDisabled: true, stagingOnly: true };
  // realDataOnly suppresses historical demo seeding; these records are explicitly synthetic.
  for (const key of ['profiles','churches','branches','memberCommunities','contacts','directMessages','serviceSubscriptions','wallets','walletTransactions','referrals','marketplaceListings','marketplaceConversations','marketplaceMessages','propertyListings','propertyConversations','propertyMessages','jobListings','availableLifts','rideRequests','businessProfiles','legalAcceptances','memberDocuments','privateUploadOwners']) state[key] = [];
  state.users = accounts.map((account, i) => ({ id: 91001 + i, firstName: 'Staging', lastName: names[i],
    telephoneNumber: account.telephoneNumber, email: `${account.name}@example.test`, roles: account.roles,
    status: 'active', passwordHash: account.passwordHash }));
  state.profiles = state.users.map(user => ({ userId: user.id, telephoneNumber: user.telephoneNumber, email: user.email }));
  state.tenantAccessDirectory = ['a','b'].map(s => ({ id: `tenant-stage-${s}`, name: `STAGING Tenant ${s.toUpperCase()}`, status: 'active' }));
  state.importedCommunities = ['a','b'].map(s => ({ id: `community-stage-${s}`, name: `STAGING Community ${s.toUpperCase()}`, tenantId: `tenant-stage-${s}`, tenantName: `STAGING Tenant ${s.toUpperCase()}`, status: 'active' }));
  state.churches = state.importedCommunities.map(c => ({ id: c.id, name: c.name, status: 'ACTIVE' }));
  const permissions = ['reports.view','tenant.view','branding.manage','communities.view','users.manage'];
  state.tenantStaff = ['a','b'].map((s,i) => ({ id: `staff-stage-${s}`, userId: String(91002+i), tenantId: `tenant-stage-${s}`, permissions: [...permissions], status: 'active' }));
  for (const [id, scopes] of [[91001,['a','b']],[91002,['a']],[91003,['b']],[91004,['a']],[91005,['b']],[91006,['a','b']],[91007,['a']]]) {
    for (const [i,s] of scopes.entries()) state.memberCommunities.push({ memberId: String(id), communityId: `community-stage-${s}`, churchId: `community-stage-${s}`, tenantId: `tenant-stage-${s}`, communityName: `STAGING Community ${s.toUpperCase()}`, churchName: `STAGING Community ${s.toUpperCase()}`, isPrimary: i === 0 });
  }
  state.providerAccessGrants = [{ id: 'grant-stage-a', userId: '91007', serviceProviderId: 'provider-stage-a', tenantId: 'tenant-stage-a', communityId: 'community-stage-a', serviceCodes: ['funeral-cover'], status: 'active' }];
  return state;
}

export function stagingBanner(html) {
  return html.replace(/<title>/i, '<title>STAGING | ').replace(/<body([^>]*)>/i,
    '<body$1><aside role="status" style="position:relative;z-index:2147483647;padding:10px 16px;background:#ffdf80;color:#17212b;font:600 14px Arial,sans-serif;text-align:center">STAGING REHEARSAL - Synthetic data only. No real payments. Not production.</aside>');
}

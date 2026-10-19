// Only identifiers traced to platform-store's original fixtures belong here.
const fixtureIds = {
  churches: ['1', '2', '3'],
  branches: ['branch-001', 'branch-002', 'branch-003'],
  jobListings: ['job-001', 'job-002'],
  availableLifts: ['lift-001', 'lift-002', 'lift-003', 'lift-004'],
  marketplaceListings: ['listing-001', 'listing-002', 'listing-003'],
  propertyListings: Array.from({ length: 11 }, (_, i) => `property-${String(i + 1).padStart(3, '0')}`),
  memberDocuments: ['doc-001'],
  walletTransactions: ['wallet-seed-1']
};

export function cleanConfirmedFixtures(original) {
  const state = structuredClone(original);
  const removed = {};
  const filter = (key, predicate) => {
    if (!Array.isArray(state[key])) return;
    const before = state[key];
    state[key] = before.filter(row => !predicate(row));
    removed[key] = before.length - state[key].length;
  };
  for (const [key, ids] of Object.entries(fixtureIds)) {
    filter(key, row => ids.includes(String(row.id)) && !row.importSource);
  }
  const removedChurches = new Set((original.churches || []).filter(c => !state.churches.some(x => x.id === c.id)).map(c => c.id));
  filter('memberCommunities', row => removedChurches.has(row.communityId || row.churchId));
  const removedLifts = new Set((original.availableLifts || []).filter(l => !state.availableLifts.some(x => x.id === l.id)).map(l => l.id));
  filter('rideRequests', row => removedLifts.has(row.liftId));
  state.demoUsersDisabled = true;
  state.realDataOnly = true;
  state.version = Math.max(11, state.version || 0);
  state.dataCleanup = { version: 1, preserveAllImportedUsers: true, keepMaxime: true, keepIngwe: true };
  return { state, report: { removed, usersPreserved: state.users.length, importedUsersPreserved: state.users.filter(u => u.importSource).length } };
}

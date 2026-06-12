import { hashIdNumber } from './id-number.js';
import { readPlatformState, updatePlatformState } from './platform-store.js';

const demoUsers = [
  { id: 1, telephone_number: '0712345678', first_name: 'Jeremy', last_name: 'Shabalala', email: 'jeremy@inkoloconnect.local', roles: ['Member'], status: 'active', membership_type: null },
  { id: 2, telephone_number: '0725550184', first_name: 'Nandi', last_name: 'Mthembu', email: 'nandi@inkoloconnect.local', roles: ['Member', 'Pastor'], status: 'active', membership_type: null },
  { id: 3, telephone_number: '0736614209', first_name: 'Thabo', last_name: 'Khumalo', email: 'thabo@inkoloconnect.local', roles: ['Member', 'Bishop'], status: 'active', membership_type: null },
  { id: 4, telephone_number: '0789441132', first_name: 'Lerato', last_name: 'Sithole', email: 'lerato@inkoloconnect.local', roles: ['Member', 'KZNCC User'], status: 'active', membership_type: null },
  { id: 5, telephone_number: '0741002003', first_name: 'Ayanda', last_name: 'Dlamini', email: 'ayanda@inkoloconnect.local', roles: ['Member', 'KZNCC Admin'], status: 'active', membership_type: null },
  { id: 6, telephone_number: '0763004005', first_name: 'Sipho', last_name: 'Ncube', email: 'sipho@inkoloconnect.local', roles: ['Admin User'], status: 'active', membership_type: null },
  { id: 7, telephone_number: '0795006007', first_name: 'Zanele', last_name: 'Mkhize', email: 'zanele@africanbank.local', roles: ['Service Provider Admin'], status: 'active', membership_type: null },
  { id: 8, telephone_number: '0817008009', first_name: 'Mandla', last_name: 'Cele', email: 'mandla@africanbank.local', roles: ['Service Provider User'], status: 'active', membership_type: null }
];

const demoSubscriptions = new Map();
const demoApplications = new Map();

export function findDemoUser(telephoneNumber, pepper) {
  const suppliedHash = hashIdNumber(telephoneNumber, pepper);
  const platformUser = readPlatformState().users.find(
    (user) => hashIdNumber(user.telephoneNumber, pepper) === suppliedHash
  );
  if (platformUser) return getDemoUserById(platformUser.id);
  const user = demoUsers.find(
    (user) => hashIdNumber(user.telephone_number, pepper) === suppliedHash
  );
  return user ? getDemoUserById(user.id) : null;
}

export function getDemoUserById(id) {
  const user = demoUsers.find((item) => String(item.id) === String(id));
  const platformUser = readPlatformState().users.find(
    (item) => String(item.id) === String(id)
  );
  if (!user && !platformUser) return null;
  return {
    id: platformUser?.id ?? user.id,
    telephone_number: platformUser?.telephoneNumber ?? user.telephone_number,
    first_name: platformUser?.firstName ?? user.first_name,
    last_name: platformUser?.lastName ?? user.last_name,
    email: platformUser?.email ?? user.email,
    roles: platformUser?.roles ?? user.roles,
    status: platformUser?.status ?? user.status,
    membership_type: user?.membership_type ?? null
  };
}

export function updateDemoProfile(id, firstName, lastName) {
  const user = getDemoUserById(id);
  if (!user) {
    return null;
  }
  user.first_name = firstName;
  user.last_name = lastName;
  updatePlatformState((state) => {
    const platformUser = state.users.find((item) => String(item.id) === String(id));
    if (platformUser) {
      platformUser.firstName = firstName;
      platformUser.lastName = lastName;
    }
  });
  return getDemoUserById(id);
}

export function getDemoSubscriptions(userId) {
  const persisted = readPlatformState().serviceSubscriptions ?? [];
  const stored = persisted.filter(
    (subscription) => String(subscription.userId) === String(userId)
  );
  return stored.length
    ? stored
    : [...demoSubscriptions.values()].filter(
        (subscription) => String(subscription.userId) === String(userId)
      );
}

export function saveDemoSubscription(userId, subscription) {
  const saved = {
    userId: Number(userId),
    ...subscription,
    status: 'active',
    subscribedAt: new Date().toISOString()
  };
  demoSubscriptions.set(`${userId}:${subscription.serviceCode}`, saved);
  updatePlatformState((state) => {
    state.serviceSubscriptions ??= [];
    const index = state.serviceSubscriptions.findIndex(
      (item) =>
        String(item.userId) === String(userId) &&
        item.serviceCode === subscription.serviceCode
    );
    if (index >= 0) {
      state.serviceSubscriptions[index] = saved;
    } else {
      state.serviceSubscriptions.push(saved);
    }
  });
  return saved;
}

export function saveDemoApplication(userId, application) {
  const saved = {
    userId: Number(userId),
    ...application,
    status: 'submitted',
    submittedAt: new Date().toISOString()
  };
  demoApplications.set(`${userId}:${application.serviceCode}`, saved);
  return saved;
}

export function resetDemoUserServices(userId) {
  const userPrefix = `${userId}:`;
  for (const key of demoSubscriptions.keys()) {
    if (key.startsWith(userPrefix)) {
      demoSubscriptions.delete(key);
    }
  }
  for (const key of demoApplications.keys()) {
    if (key.startsWith(userPrefix)) {
      demoApplications.delete(key);
    }
  }
  updatePlatformState((state) => {
    state.serviceSubscriptions = (state.serviceSubscriptions ?? []).filter(
      (subscription) => String(subscription.userId) !== String(userId)
    );
  });
}

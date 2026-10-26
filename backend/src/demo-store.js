import { hashIdNumber } from './id-number.js';
import { readPlatformState, updatePlatformState } from './platform-store.js';

// Keep the legacy exports for callers using platform-document accounts.
function accountUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    telephone_number: user.telephoneNumber,
    first_name: user.firstName,
    last_name: user.lastName,
    email: user.email ?? null,
    roles: user.roles ?? ['Member'],
    status: user.status ?? 'active',
    membership_type: user.membershipType ?? null
  };
}

export function findDemoUser(telephoneNumber, pepper) {
  const suppliedHash = hashIdNumber(telephoneNumber, pepper);
  return accountUser(readPlatformState().users.find(
    (user) => hashIdNumber(user.telephoneNumber, pepper) === suppliedHash
  ));
}

export function getDemoUserById(id) {
  return accountUser(readPlatformState().users.find(
    (user) => String(user.id) === String(id)
  ));
}

export async function updateDemoProfile(id, firstName, lastName) {
  return updatePlatformState((state) => {
    const user = state.users.find((item) => String(item.id) === String(id));
    if (!user) return null;
    user.firstName = firstName;
    user.lastName = lastName;
    return accountUser(user);
  });
}

export function getDemoSubscriptions(userId) {
  return (readPlatformState().serviceSubscriptions ?? []).filter(
    (subscription) => String(subscription.userId) === String(userId)
  );
}

export async function saveDemoSubscription(userId, subscription) {
  const saved = {
    ...subscription,
    userId: Number(userId),
    status: 'active',
    subscribedAt: new Date().toISOString()
  };
  return updatePlatformState((state) => {
    state.serviceSubscriptions ??= [];
    const index = state.serviceSubscriptions.findIndex(
      (item) =>
        String(item.userId) === String(userId) &&
        item.serviceCode === subscription.serviceCode &&
        (item.communityId || '') === (subscription.communityId || '')
    );
    if (index >= 0) state.serviceSubscriptions[index] = saved;
    else state.serviceSubscriptions.push(saved);
    return saved;
  });
}

export async function saveDemoApplication(userId, application) {
  const saved = {
    ...application,
    userId: Number(userId),
    status: 'submitted',
    submittedAt: new Date().toISOString()
  };
  return updatePlatformState((state) => {
    state.serviceApplications ??= [];
    const index = state.serviceApplications.findIndex(
      (item) => String(item.userId) === String(userId) &&
        item.serviceCode === application.serviceCode
    );
    if (index >= 0) state.serviceApplications[index] = saved;
    else state.serviceApplications.push(saved);
    return saved;
  });
}

export async function resetDemoUserServices(userId) {
  await updatePlatformState((state) => {
    state.serviceSubscriptions = (state.serviceSubscriptions ?? []).filter(
      (item) => String(item.userId) !== String(userId)
    );
    state.serviceApplications = (state.serviceApplications ?? []).filter(
      (item) => String(item.userId) !== String(userId)
    );
  });
}

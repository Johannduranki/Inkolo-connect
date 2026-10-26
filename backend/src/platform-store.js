import { randomUUID } from 'node:crypto';
import { MysqlPlatformStore } from './mysql-platform-store.js';

export const platformStorage = 'mariadb';
let sqlStore;
let initializing = false;

export async function initializePlatformStorage(pool) {
  if (sqlStore || initializing) throw Error('Platform storage already initialized.');
  initializing = true;
  try {
    const store = new MysqlPlatformStore(pool);
    await store.open();
    sqlStore = store;
  } finally {
    initializing = false;
  }
}

function readyStore() {
  if (!sqlStore) throw Object.assign(Error('Platform storage is not ready.'), { status: 503 });
  return sqlStore;
}

export function readPlatformState() {
  return readyStore().read();
}

export function updatePlatformState(mutator) {
  return readyStore().update(mutator);
}

export function createPlatformId(prefix) {
  return `${prefix}-${randomUUID()}`;
}

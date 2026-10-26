import { readSqlDocument } from './mysql-platform-store.js';

// The platform document is canonical even when SQL endpoint tables also exist.
export async function selectAccountStorage(pool, env = process.env) {
  const features = ['PLATFORM', 'AUTH', 'TREASURY', 'TRAINING', 'CYCLE', 'HERITAGE'];
  for (const feature of features) {
    if (env[`${feature}_STORAGE`] && env[`${feature}_STORAGE`] !== 'mariadb') {
      throw Object.assign(Error('Only MariaDB storage is supported.'), { code: 'ACCOUNT_STORAGE_CONFLICT' });
    }
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { state } = await readSqlDocument(connection);
    if (!Array.isArray(state.users) || state.demoUsersDisabled !== true) {
      throw Error('Platform accounts must disable demo identities.');
    }
  } finally {
    try { await connection.rollback(); } finally { connection.release(); }
  }
  for (const feature of features) env[`${feature}_STORAGE`] = 'mariadb';
  return 'platform';
}

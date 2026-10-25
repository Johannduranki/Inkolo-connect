import {readSqlDocument} from './mysql-platform-store.js';

// Select only a verified imported format. Never treat a connection/query failure
// as permission to fall back to local accounts.
export async function selectAccountStorage(pool, env = process.env) {
  const [tables] = await pool.query('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()');
  const names = new Set(tables.map(row => row.name));
  const document = names.has('duranki_platform_document');
  if (!document) return 'relational';
  const [documents] = await pool.query("SELECT id FROM duranki_platform_document WHERE id='platform'");
  if (!documents.length) return 'relational';
  if (names.has('users')) throw Object.assign(Error('Both account formats exist; reconcile them before startup.'), {code:'ACCOUNT_STORAGE_AMBIGUOUS'});
  const [migration] = await pool.query('SELECT id FROM duranki_platform_migration WHERE id=1');
  if (migration.length !== 1) throw Error('Verified platform migration is required.');
  const connection = await pool.getConnection();
  let state;
  try {
    await connection.beginTransaction();
    ({state} = await readSqlDocument(connection));
  } finally {
    await connection.rollback();
    connection.release();
  }
  if (!Array.isArray(state.users) || state.demoUsersDisabled !== true) throw Error('Imported accounts must disable demo identities.');
  for (const feature of ['PLATFORM','AUTH','TREASURY','TRAINING','CYCLE','HERITAGE']) {
    const key = `${feature}_STORAGE`;
    if (env[key] && env[key] !== 'mariadb') throw Object.assign(Error('Imported database conflicts with configured storage.'), {code:'ACCOUNT_STORAGE_CONFLICT'});
  }
  for (const feature of ['PLATFORM','AUTH','TREASURY','TRAINING','CYCLE','HERITAGE']) env[`${feature}_STORAGE`] = 'mariadb';
  return 'platform';
}

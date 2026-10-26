import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { platformDigest, readSqlDocument, writeSqlDocument } from '../src/mysql-platform-store.js';
import { activeMigrationFiles } from '../src/schema-migration.js';
import { verifyDatabase } from '../src/database.js';

const groups = {
  auth: ['duranki_auth_identity', 'duranki_auth_session', 'duranki_mfa_credential', 'duranki_mfa_challenge', 'duranki_mfa_audit'],
  treasury: ['scope', 'party', 'receipt', 'payment', 'payment_line', 'staff', 'audit'].map(name => `duranki_treasury_${name}`),
  training: ['programme', 'attempt', 'entitlement', 'audit'].map(name => `duranki_training_${name}`),
  cycle: ['request', 'event', 'audit', 'subscription', 'intent', 'fulfilment', 'dispatch', 'consent'].map(name => `cycle_${name}`),
  heritage: ['catalogue', 'tenant_service', 'community_service', 'verifier', 'tree', 'person', 'relationship', 'invitation', 'leadership', 'succession', 'document', 'verification_history', 'audit', 'duplicate_review', 'enrolment'].map(name => `heritage_${name}`)
};

export function emptyPlatformState() {
  const collections = ['users', 'profiles', 'churches', 'branches', 'memberCommunities',
    'contacts', 'directMessages', 'serviceSubscriptions', 'wallets', 'walletTransactions',
    'referrals', 'marketplaceListings', 'marketplaceConversations', 'marketplaceMessages',
    'propertyListings', 'propertyConversations', 'propertyMessages', 'jobListings',
    'availableLifts', 'rideRequests', 'businessProfiles', 'legalAcceptances', 'memberDocuments'];
  // Service definitions remain in the checked-in catalogue and SQL migrations.
  return { version: 11, realDataOnly: true, demoUsersDisabled: true,
    ...Object.fromEntries(collections.map(name => [name, []])) };
}

async function emptyCounts(connection, tables) {
  const counts = {};
  for (const table of tables) {
    const [[row]] = await connection.query(`SELECT COUNT(*) AS n FROM ${table}`);
    if (Number(row.n) !== 0) throw Error(`Refusing to bootstrap nonempty ${table} without readiness metadata.`);
    counts[table] = 0;
  }
  return counts;
}

export async function bootstrapDatabase(connection, env = process.env) {
  const encoded = env.MFA_ENCRYPTION_KEY;
  const key = Buffer.from(encoded || '', 'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded) {
    throw Error('MFA_ENCRYPTION_KEY must be the existing 32-byte key encoded as base64, or a securely provisioned key for a fresh database.');
  }
  const keyDigest = platformDigest(key);
  await verifyDatabase(connection);
  const required = activeMigrationFiles(await readdir(new URL('../database/', import.meta.url)));
  const [applied] = await connection.query('SELECT filename FROM schema_migrations');
  if (required.some(file => !applied.some(row => row.filename === file))) {
    throw Error('Run npm run migrate before npm run bootstrap.');
  }
  const [[database]] = await connection.query('SELECT DATABASE() AS name');
  const lockName = 'duranki-platform-' + platformDigest(`${database.name}:platform`).slice(0, 40);
  const [[lock]] = await connection.execute('SELECT GET_LOCK(?,0) AS acquired', [lockName]);
  if (Number(lock.acquired) !== 1) throw Error('Stop the API and other bootstrap processes before bootstrapping.');
  try {
    await connection.beginTransaction();
    const [documents] = await connection.execute('SELECT id FROM duranki_platform_document WHERE id=? FOR UPDATE', ['platform']);
    const [metadata] = await connection.query('SELECT id FROM duranki_platform_migration WHERE id=1');
    if (documents.length) {
      const { state } = await readSqlDocument(connection);
      if (!metadata.length || !Array.isArray(state.users) || state.demoUsersDisabled !== true) {
        throw Error('Existing platform document is not ready; bootstrap will not replace or repair it.');
      }
    } else {
      if (metadata.length) throw Error('Platform readiness metadata exists without its document.');
      await emptyCounts(connection, ['users', 'duranki_platform_document', 'duranki_platform_chunk']);
      const state = emptyPlatformState();
      await writeSqlDocument(connection, 'platform', state, 1);
      const counts = Object.fromEntries(Object.entries(state).filter(([, value]) => Array.isArray(value)).map(([name]) => [name, 0]));
      await connection.execute('INSERT INTO duranki_platform_migration(id,source_sha256,counts_json) VALUES(1,?,?)', [platformDigest(JSON.stringify(state)), JSON.stringify(counts)]);
    }
    for (const [group, tables] of Object.entries(groups)) {
      const service = group === 'cycle' || group === 'heritage';
      const table = service ? 'duranki_service_migration' : `duranki_${group}_migration`;
      const [existing] = await connection.execute(`SELECT * FROM ${table} WHERE ${service ? 'service=?' : 'id=1'} FOR UPDATE`, service ? [group] : []);
      if (existing.length) {
        if (group === 'auth' && existing[0].key_sha256 !== keyDigest) throw Error('MFA key mismatch. Restore the original key; bootstrap never rotates keys.');
        continue;
      }
      if (service) {
        const [locks] = await connection.execute('SELECT service FROM duranki_service_write_lock WHERE service=? FOR UPDATE', [group]);
        if (locks.length !== 1) throw Error('Service schema is not prepared. Run npm run migrate.');
      }
      const counts = await emptyCounts(connection, tables);
      if (group === 'heritage') {
        await connection.execute('INSERT INTO heritage_catalogue(service_id,name) VALUES(?,?)', ['duranki-heritage', 'Duranki Heritage / Family Tree']);
        counts.heritage_catalogue = 1;
      }
      const digest = platformDigest(JSON.stringify({ bootstrap: 1, group, counts }));
      if (group === 'auth') {
        await connection.execute('INSERT INTO duranki_auth_migration(id,source_sha256,key_sha256,counts_json) VALUES(1,?,?,?)', [digest, keyDigest, JSON.stringify(counts)]);
      } else if (service) {
        await connection.execute('INSERT INTO duranki_service_migration(service,source_sha256,counts_json) VALUES(?,?,?)', [group, digest, JSON.stringify(counts)]);
      } else {
        await connection.execute(`INSERT INTO ${table}(id,source_sha256,counts_json) VALUES(1,?,?)`, [digest, JSON.stringify(counts)]);
      }
    }
    await connection.commit();
    return { status: 'BOOTSTRAP_READY', platform: documents.length ? 'preserved' : 'created', keyPreserved: true };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let connection;
  try {
    await import('dotenv/config');
    const { default: mysql } = await import('mysql2/promise');
    connection = await mysql.createConnection({ host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER,
      password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
    console.log(JSON.stringify(await bootstrapDatabase(connection)));
  } catch (error) {
    // Do not expose SQL parameters or connection credentials in command output.
    console.error(JSON.stringify({ status: 'BOOTSTRAP_FAILED', message: error.sql ? 'Database operation failed; verify migrations and database configuration.' : error.message }));
    process.exitCode = 1;
  } finally {
    await connection?.end();
  }
}

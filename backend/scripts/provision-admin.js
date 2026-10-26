import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { verifyDatabase } from '../src/database.js';
import { platformDigest, readSqlDocument, writeSqlDocument } from '../src/mysql-platform-store.js';

export async function provisionAdmin(connection, { userId, telephoneNumber, operator, confirmed } = {}, env = process.env) {
  if (confirmed !== true || !/^[1-9][0-9]*$/.test(String(userId || '')) ||
      !/^0[0-9]{9}$/.test(telephoneNumber || '') || typeof operator !== 'string' ||
      !operator.trim() || operator.length > 100 || /[\r\n]/.test(operator)) {
    throw Error('Explicit account ID, telephone confirmation, operator and identity verification are required.');
  }
  const encoded = env.MFA_ENCRYPTION_KEY;
  const key = Buffer.from(encoded || '', 'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded) throw Error('A valid existing MFA_ENCRYPTION_KEY is required.');
  await verifyDatabase(connection);
  const [[database]] = await connection.query('SELECT DATABASE() AS name');
  const lockName = 'duranki-platform-' + platformDigest(`${database.name}:platform`).slice(0, 40);
  const [[lock]] = await connection.execute('SELECT GET_LOCK(?,0) AS acquired', [lockName]);
  if (Number(lock.acquired) !== 1) throw Error('Stop all API instances before provisioning an administrator.');
  try {
    await connection.beginTransaction();
    const [auth] = await connection.execute('SELECT key_sha256 FROM duranki_auth_migration WHERE id=1');
    if (auth.length !== 1 || auth[0].key_sha256 !== platformDigest(key)) throw Error('Authentication storage and the existing MFA key must match. Run bootstrap first for a fresh database.');
    const [platform] = await connection.query('SELECT id FROM duranki_platform_migration WHERE id=1');
    if (platform.length !== 1) throw Error('Platform storage must be initialized first.');
    const { state, revision } = await readSqlDocument(connection);
    if (state.demoUsersDisabled !== true || !Array.isArray(state.users)) throw Error('A non-demo platform document is required.');
    const matches = state.users.filter(user => String(user.id) === String(userId));
    const user = matches[0];
    if (matches.length !== 1 || user.status !== 'active' || user.telephoneNumber !== telephoneNumber ||
        state.users.filter(item => item.telephoneNumber === telephoneNumber).length !== 1 ||
        !/^scrypt-v1:[a-f0-9]{32}:[a-f0-9]{128}$/.test(user.passwordHash || '') ||
        !Array.isArray(user.roles) || !state.profiles?.some(profile => String(profile.userId) === String(userId))) {
      throw Error('Choose one active registered account with a matching telephone, profile and current password credential.');
    }
    if (user.roles.includes('Platform Admin')) {
      await connection.commit();
      return { status: 'ADMIN_ALREADY_PROVISIONED', userId: String(userId) };
    }
    user.roles.push('Platform Admin');
    (state.securityAudit ??= []).push({ id: randomUUID(), action: 'CLI_ADMIN_PROVISIONED',
      actorId: 'private-cli', operator: operator.trim(), targetUserId: String(userId), at: new Date().toISOString() });
    // Privilege changes and session invalidation commit together while the API is stopped.
    await connection.execute('UPDATE duranki_auth_session SET revoked=1 WHERE user_id=?', [String(userId)]);
    await connection.execute('DELETE FROM duranki_mfa_challenge WHERE user_id=?', [String(userId)]);
    await writeSqlDocument(connection, 'platform', state, revision + 1, revision);
    await connection.commit();
    return { status: 'ADMIN_PROVISIONED', userId: String(userId), mfaRequired: true };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let connection, prompt;
  try {
    if (process.argv.length !== 3 || process.argv[2] !== '--api-stopped' || !process.stdin.isTTY || !process.stdout.isTTY) {
      throw Error('Use npm run provision-admin -- --api-stopped in a private interactive terminal after stopping the API.');
    }
    await import('dotenv/config');
    const { createInterface } = await import('node:readline/promises');
    prompt = createInterface({ input: process.stdin, output: process.stdout });
    const userId = (await prompt.question('Existing registered account ID: ')).trim();
    const telephoneNumber = (await prompt.question('Confirm registered telephone (10 digits): ')).trim();
    const operator = (await prompt.question('Operator identifier for the audit record: ')).trim();
    const confirmation = await prompt.question(`After independently verifying this account owner, type PROMOTE ${userId}: `);
    if (confirmation !== `PROMOTE ${userId}`) throw Error('Promotion cancelled.');
    prompt.close(); prompt = undefined;
    const { default: mysql } = await import('mysql2/promise');
    connection = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
    console.log(JSON.stringify(await provisionAdmin(connection, { userId, telephoneNumber, operator, confirmed: true })));
  } catch (error) {
    console.error(JSON.stringify({ status: 'ADMIN_PROVISION_FAILED', message: error.code ? 'Database or configuration operation failed; no credentials are logged.' : error.message }));
    process.exitCode = 1;
  } finally {
    prompt?.close();
    await connection?.end();
  }
}

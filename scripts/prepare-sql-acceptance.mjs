import { readFileSync, writeFileSync, realpathSync, existsSync, cpSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash } from 'node:crypto';
import { createServer } from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
import { privateBackupDirectory } from '../backend/src/private-backup-directory.js';
import { writeSqlDocument, readSqlDocument, platformDigest } from '../backend/src/mysql-platform-store.js';
import { serviceSnapshot, migrateServiceSnapshot } from '../backend/src/service-migration.js';

const root = realpathSync(process.argv[2]), repo = process.cwd();
const read = file => JSON.parse(readFileSync(path.join(root, file)));
assert.equal(read('manifest.json').kind, 'duranki-isolated-rehearsal-v1');
assert.equal(read('manifest.json').root, root);
assert.equal(path.basename(path.dirname(root)), 'staging');
assert.ok(!existsSync(path.join(root, 'running.json')));
const state = read('backend/data/platform-store.json');
assert.equal(state.stagingOnly, true);
assert.ok(state.users.every(u => u.email.endsWith('@example.test')));
const port = 13308, database = 'duranki_synthetic_acceptance';
const dir = path.join(root, 'sql-isolated');
const resume = process.argv.includes('--resume');
assert.ok(resume ? existsSync(path.join(dir, 'admin.private.json')) && !existsSync(path.join(dir, 'prepared.json')) : !existsSync(dir), 'Only resume an unfinished synthetic preparation');
const reservation = createServer();
if (!resume) {
await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(port, '127.0.0.1', resolve); });
await new Promise(resolve => reservation.close(resolve));
privateBackupDirectory(dir);
}
const data = path.join(dir, 'data'), bin = 'C:/Program Files/MariaDB 10.11/bin';
const password = resume ? read('sql-isolated/admin.private.json').password : randomBytes(32).toString('hex'), appPassword = randomBytes(32).toString('hex');
const mysql = createRequire(path.join(repo, 'backend/package.json'))('mysql2/promise');
const hash = value => createHash('sha256').update(value).digest('hex');
let connection;
try {
  if (!resume) {
  execFileSync(path.join(bin, 'mariadb-install-db.exe'), ['--datadir=' + data, '--port=' + port, '--password=' + password, '--silent'], { windowsHide: true, stdio: 'pipe', timeout: 120000 });
  execFileSync('icacls.exe', [data, '/reset', '/T', '/Q'], { windowsHide: true, stdio: 'pipe' });
  const server = spawn(path.join(bin, 'mariadbd.exe'), ['--defaults-file=' + path.join(data, 'my.ini'), '--bind-address=127.0.0.1', '--skip-log-bin', '--event-scheduler=OFF', '--innodb-buffer-pool-size=128M', '--log-error=' + path.join(dir, 'server.err.log')], { detached: true, windowsHide: true, stdio: 'ignore' });
  await new Promise((resolve, reject) => { server.once('spawn', resolve); server.once('error', reject); });
  server.unref();
  writeFileSync(path.join(dir, 'admin.private.json'), JSON.stringify({ root, data, port, pid: server.pid, password }), { flag: 'wx' });
  }
  for (let i = 0; i < 60; i++) {
    try { connection = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password, multipleStatements: true }); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  assert.ok(connection, 'New isolated SQL server unavailable');
  const [[identity]] = await connection.query('SELECT @@datadir AS data,@@port AS port,@@bind_address AS binding');
  assert.equal(realpathSync(identity.data).toLowerCase(), realpathSync(data).toLowerCase());
  assert.equal(Number(identity.port), port); assert.equal(identity.binding, '127.0.0.1');
  await connection.query(`CREATE DATABASE IF NOT EXISTS ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`);
  await connection.changeUser({ database });
  for (const file of ['018_native_auth_storage.sql','019_native_treasury_storage.sql','020_platform_document_storage.sql','021_native_training_storage.sql','022_native_cycle_storage.sql','023_native_heritage_storage.sql']) await connection.query(readFileSync(path.join(repo, 'backend/database', file), 'utf8'));
  // Copy only the synthetic fixture, validating every copied field before migration markers.
  async function copyTables(filename, mapping) {
    const sqlite = new DatabaseSync(path.join(root, 'backend/data', filename), { readOnly: true });
    const plans = [], counts = {};
    try {
      for (const [source, target] of mapping) {
        const columns = sqlite.prepare(`PRAGMA table_info(${source})`).all().map(c => c.name);
        assert.ok(columns.length);
        const rows = sqlite.prepare(`SELECT * FROM ${source}`).all();
        const [[before]] = await connection.query(`SELECT COUNT(*) AS n FROM ${target}`);
        if (!Number(before.n)) for (const row of rows) await connection.execute(`INSERT INTO ${target}(${columns.map(c => '`' + c + '`').join(',')}) VALUES(${columns.map(() => '?').join(',')})`, columns.map(c => row[c]));
        const [copied] = await connection.query(`SELECT ${columns.map(c => '`' + c + '`').join(',')} FROM ${target}`);
        const canonical = list => list.map(row => JSON.stringify(columns.map(c => row[c]))).sort();
        assert.deepEqual(canonical(copied), canonical(rows));
        plans.push({ target, rows }); counts[target] = rows.length;
      }
    } finally { sqlite.close(); }
    return { fingerprint: hash(JSON.stringify(plans)), counts };
  }
  const auth = await copyTables('mfa.sqlite', [['credential','duranki_mfa_credential'],['challenge','duranki_mfa_challenge'],['mfa_audit','duranki_mfa_audit']]);
  for (const user of state.users) await connection.execute('INSERT IGNORE INTO duranki_auth_identity(user_id) VALUES(?)', [String(user.id)]);
  await connection.execute('INSERT IGNORE INTO duranki_auth_migration(id,source_sha256,key_sha256,counts_json) VALUES(1,?,?,?)', [auth.fingerprint, hash(readFileSync(path.join(root, 'backend/data/mfa.key'))), JSON.stringify(auth.counts)]);
  const treasury = await copyTables('treasury.sqlite', ['scope','party','receipt','payment','payment_line','staff','audit'].map(t => [t, 'duranki_treasury_' + t]));
  const training = await copyTables('trader-training.sqlite', ['programme','attempt','entitlement','training_audit'].map(t => [t, t === 'training_audit' ? 'duranki_training_audit' : 'duranki_training_' + t]));
  for (const [name, copied] of [['treasury', treasury], ['training', training]]) await connection.execute(`INSERT INTO duranki_${name}_migration(id,source_sha256,counts_json) VALUES(1,?,?)`, [copied.fingerprint, JSON.stringify(copied.counts)]);
  for (const service of ['cycle', 'heritage']) {
    const sqlite = new DatabaseSync(path.join(root, 'backend/data', service + '.sqlite'), { readOnly: true });
    try { await migrateServiceSnapshot(connection, serviceSnapshot(sqlite, service)); } finally { sqlite.close(); }
  }
  await writeSqlDocument(connection, 'platform', state, 1);
  assert.deepEqual((await readSqlDocument(connection)).state, state);
  await connection.execute('INSERT INTO duranki_platform_migration(id,source_sha256,counts_json) VALUES(1,?,?)', [platformDigest(JSON.stringify(state)), JSON.stringify({ users: state.users.length })]);
  await connection.query("CREATE USER 'acceptance_app'@'127.0.0.1' IDENTIFIED BY ?", [appPassword]);
  await connection.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ${database}.* TO 'acceptance_app'@'127.0.0.1'`);
  writeFileSync(path.join(dir, 'app.private.json'), JSON.stringify({ root, data, port, database, user: 'acceptance_app', password: appPassword }), { flag: 'wx' });
  cpSync(path.join(repo, 'tmp/release-candidate-20261018/frontend/browser'), path.join(root, 'frontend/dist/duranki-login/browser'), { recursive: true });
  writeFileSync(path.join(dir, 'prepared.json'), JSON.stringify({ at: new Date().toISOString(), syntheticOnly: true, users: state.users.length, copiedRowsVerified: true, liveConnectionOpened: false, port, database, auth, treasury, training }, null, 2));
  console.log(JSON.stringify({ status: 'SYNTHETIC_SQL_PREPARED', root, port, users: state.users.length }));
} catch (error) {
  console.error(JSON.stringify({ status: 'SYNTHETIC_SQL_INCOMPLETE', code: error.code || error.name, step: error instanceof assert.AssertionError ? error.message.slice(0, 160) : 'Inspect setup safely; files retained' }));
  process.exitCode = 1;
} finally { await connection?.end(); }

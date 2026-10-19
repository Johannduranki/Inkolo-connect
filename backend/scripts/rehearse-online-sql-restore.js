import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { privateBackupDirectory } from '../src/private-backup-directory.js';
import { captureDatabase, sealSnapshot, openSnapshot, restoreTables, identifier } from '../src/sql-backup-snapshot.js';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const bin = 'C:/Program Files/MariaDB 10.11/bin';
const powershell = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
const port = Number(process.argv[2] || 13306);
const ps = (script, extra = {}) => execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...extra } }).trim();
let source, target, root;
try {
  if (process.platform !== 'win32') throw Error('This protected restore rehearsal requires Windows DPAPI.');
  if (!Number.isInteger(port) || port < 13306 || port > 13399) throw Error('Use only a dedicated restore-test port.');
  const reservation = createServer();
  await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(port, '127.0.0.1', resolve); });
  await new Promise(resolve => reservation.close(resolve));
  root = path.join(repo, 'backend/data/backups', 'online-restore-' + randomUUID());
  privateBackupDirectory(root);
  const env = dotenv.parse(readFileSync(path.join(repo, 'backend/.env')));
  source = await mysql.createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT || 3306), user: env.DB_USER, password: env.DB_PASSWORD,
    database: env.DB_NAME, dateStrings: true, supportBigNumbers: true, bigNumberStrings: true, jsonStrings: true });
  const snapshot = await captureDatabase(source);
  await source.end(); source = undefined;
  const key = randomBytes(32);
  const encrypted = sealSnapshot(snapshot, key);
  writeFileSync(path.join(root, 'database.snapshot.aesgcm'), encrypted, { flag: 'wx', mode: 0o600 });
  const wrapped = ps("Add-Type -AssemblyName System.Security; [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Convert]::FromBase64String($env:DURANKI_WRAP_KEY),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))", { DURANKI_WRAP_KEY: key.toString('base64') });
  writeFileSync(path.join(root, 'snapshot-key.dpapi'), wrapped, { flag: 'wx', mode: 0o600 });
  key.fill(0);
  const recovered = Buffer.from(ps("Add-Type -AssemblyName System.Security; [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($env:DURANKI_WRAPPED_KEY),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))", { DURANKI_WRAPPED_KEY: readFileSync(path.join(root, 'snapshot-key.dpapi'), 'utf8') }), 'base64');
  const restoredSnapshot = openSnapshot(readFileSync(path.join(root, 'database.snapshot.aesgcm')), recovered);
  recovered.fill(0);

  const data = path.join(root, 'restore-instance'), password = randomBytes(32).toString('hex');
  // Initialize a NEW datadir. Never pass the live datadir or a Windows service name.
  execFileSync(path.join(bin, 'mariadb-install-db.exe'), ['--datadir=' + data, '--port=' + port, '--password=' + password, '--silent'], { windowsHide: true, stdio: 'pipe', timeout: 120000 });
  // The Windows initializer adds an explicit builtin-domain ACL; inherit only the protected backup root.
  execFileSync('icacls.exe', [data, '/reset', '/T', '/Q'], { windowsHide: true, stdio: 'pipe' });
  const config = path.join(data, 'my.ini');
  const server = spawn(path.join(bin, 'mariadbd.exe'), ['--defaults-file=' + config, '--bind-address=127.0.0.1', '--skip-log-bin', '--event-scheduler=OFF', '--innodb-buffer-pool-size=128M', '--max-allowed-packet=128M', '--log-error=' + path.join(root, 'server.err.log')], { detached: true, windowsHide: true, stdio: 'ignore' });
  await new Promise((resolve, reject) => { server.once('spawn', resolve); server.once('error', reject); });
  server.unref();
  const pid = server.pid;
  writeFileSync(path.join(root, 'runtime.private.json'), JSON.stringify({ kind: 'duranki-isolated-sql-restore-v1', root, data, port, pid, password }), { flag: 'wx', mode: 0o600 });
  for (let attempt = 0; attempt < 60; attempt++) {
    try { target = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password, dateStrings: true, supportBigNumbers: true, bigNumberStrings: true, jsonStrings: true }); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  if (!target) throw Error('Independent restore instance unavailable.');
  const [[identity]] = await target.query('SELECT @@datadir AS datadir,@@port AS port,@@bind_address AS binding,@@event_scheduler AS scheduler');
  if (realpathSync(path.resolve(identity.datadir)).toLowerCase() !== realpathSync(data).toLowerCase() || Number(identity.port) !== port || identity.binding !== '127.0.0.1' || identity.scheduler !== 'OFF') throw Error('Restore instance identity failed validation.');
  const database = 'duranki_restore_' + randomBytes(8).toString('hex');
  await target.query('CREATE DATABASE ' + identifier(database) + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  await target.changeUser({ database });
  const tables = await restoreTables(target, restoredSnapshot);
  const [check] = await target.query('CHECK TABLE ' + tables.map(table => identifier(table.name)).join(',') + ' QUICK');
  if (check.some(row => row.Msg_type === 'error' || row.Msg_type === 'warning')) throw Error('Restored table health check failed.');
  const result = { status: 'ISOLATED_SQL_RESTORE_VERIFIED', root, port, pid, database, snapshotCreatedAt: snapshot.createdAt,
    encryptedBytes: encrypted.length, encryption: 'AES-256-GCM; recovery key protected with current-user Windows DPAPI', tables,
    liveServicesStopped: false, liveSqlWrites: false, liveNetworkSettingsChanged: false, cycleConfigurationChanged: false,
    limitations: 'Application base-table snapshot only; no application attached to restored real data. Files/uploads, external keys, users/grants, routines, events and triggers are outside this drill. Restored datadir is ACL-restricted but not separately encrypted. DPAPI recovery is host/user-bound, not an off-host disaster-recovery strategy.' };
  writeFileSync(path.join(root, 'restore-results.json'), JSON.stringify(result, null, 2), { flag: 'wx', mode: 0o600 });
  await target.query('SHUTDOWN');
  await target.end().catch(() => {}); target = undefined;
  execFileSync('icacls.exe', [data, '/reset', '/T', '/Q'], { windowsHide: true, stdio: 'pipe' });
  writeFileSync(path.join(root, 'test-instance-closed.json'), JSON.stringify({ at: new Date().toISOString(), port, testServerStopped: true, backupAndRestoreFilesRetained: true, liveServicesChanged: false }), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ ...result, tables: tables.length, testServerStopped: true }));
} catch (error) {
  // Driver/bootstrap errors can contain SQL, rows or credentials; never emit their messages.
  console.error(JSON.stringify({ status: 'RESTORE_REHEARSAL_INCOMPLETE', root, code: /^[A-Z_]+$/.test(error.code || '') ? error.code : 'VALIDATION_FAILED', preserved: true }));
  process.exitCode = 1;
} finally { await source?.end(); await target?.end(); }

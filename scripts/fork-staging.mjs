import { readFileSync, writeFileSync, readdirSync, lstatSync, realpathSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { DatabaseSync, backup } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { stagingKind } from './staging-support.mjs';

// Fork only an existing synthetic rehearsal. Neither its server nor its files are changed.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(process.argv[2] || '');
const base = path.join(repo, 'tmp/staging');
if (path.dirname(source) !== base || !path.basename(source).startsWith('run-') || realpathSync(source) !== source) throw Error('Use a local staging snapshot.');
const manifest = JSON.parse(readFileSync(path.join(source, 'manifest.json'), 'utf8'));
if (manifest.kind !== stagingKind || manifest.root !== source || manifest.storage !== 'isolated-json-sqlite') throw Error('Not an isolated rehearsal.');
const platform = JSON.parse(readFileSync(path.join(source, 'backend/data/platform-store.json'), 'utf8'));
if (platform.stagingOnly !== true || platform.users?.length !== 7 || platform.users.some(user => !String(user.email).endsWith('@example.test'))) throw Error('Synthetic users required.');
function assertTree(directory) {
  if (lstatSync(directory).isSymbolicLink() || realpathSync(directory) !== directory) throw Error('Linked staging data is not supported.');
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw Error('Linked staging data is not supported.');
    if (entry.isDirectory()) assertTree(file);
  }
}
assertTree(path.join(source, 'backend/data'));
if (existsSync(path.join(source, 'backend/uploads'))) assertTree(path.join(source, 'backend/uploads'));
for (const name of ['accounts.private.json', 'mfa.private.json', 'runtime.private.json']) {
  const file = path.join(source, name);
  if (existsSync(file) && lstatSync(file).isSymbolicLink()) throw Error('Linked credentials are not supported.');
}
const prepared = JSON.parse(execFileSync(process.execPath, [path.join(repo, 'scripts/prepare-staging.mjs'), ...(process.argv.includes('--keep-latest') ? ['--keep-latest'] : [])], { encoding: 'utf8', cwd: repo }));
const root = prepared.root, checks = [];
if (path.dirname(root) !== base || root === source || realpathSync(root) !== root) throw Error('Invalid fork destination.');
const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
async function copy(relative) {
  const from = path.join(source, relative), to = path.join(root, relative);
  if (lstatSync(from).isDirectory()) {
    mkdirSync(to, { recursive: true });
    for (const entry of readdirSync(from)) await copy(path.join(relative, entry));
    return;
  }
  if (/-wal$|-shm$/.test(relative)) return;
  if (relative.endsWith('.sqlite')) {
    const input = new DatabaseSync(from, { readOnly: true });
    try { await backup(input, to); } finally { input.close(); }
    const output = new DatabaseSync(to, { readOnly: true });
    try {
      if (output.prepare('PRAGMA integrity_check').all().some(row => row.integrity_check !== 'ok')) throw Error('SQLite integrity check failed.');
    } finally { output.close(); }
    checks.push({ path: relative, integrity: 'ok', method: 'sqlite-online-backup' });
  } else {
    copyFileSync(from, to);
    if (digest(from) !== digest(to)) throw Error('Source changed while copying; fork not ready.');
    checks.push({ path: relative, sha256: digest(to), verified: true });
  }
}
await copy('backend/data');
if (existsSync(path.join(source, 'backend/uploads'))) await copy('backend/uploads');
for (const name of ['accounts.private.json', 'mfa.private.json']) if (existsSync(path.join(source, name))) await copy(name);
// Keep encrypted synthetic identities readable, but never carry signed sessions across origins.
const originalSecrets = JSON.parse(readFileSync(path.join(source, 'runtime.private.json'), 'utf8'));
const freshSecrets = JSON.parse(readFileSync(path.join(root, 'runtime.private.json'), 'utf8'));
freshSecrets.pepper = originalSecrets.pepper;
writeFileSync(path.join(root, 'runtime.private.json'), JSON.stringify(freshSecrets), { mode: 0o600 });
const copied = JSON.parse(readFileSync(path.join(root, 'backend/data/platform-store.json'), 'utf8'));
if (copied.stagingOnly !== true || copied.users.length !== 7) throw Error('Fork verification failed.');
writeFileSync(path.join(root, 'fork-verification.json'), JSON.stringify({ source, root, createdAt: new Date().toISOString(), checks, originalRetained: true,
  limitation: 'Per-store online snapshot of synthetic staging only, not a coordinated production backup or MariaDB restore.' }, null, 2));
console.log(JSON.stringify({ source, root, storesVerified: checks.filter(row => row.integrity).length, originalRetained: true, liveDataCopied: false }));

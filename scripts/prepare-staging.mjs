import { mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, lstatSync, symlinkSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { hashPassword } from '../backend/src/password-security.js';
import { privateBackupDirectory } from '../backend/src/private-backup-directory.js';
import { accountSpecs, stagingState, stagingKind, stagingBanner } from './staging-support.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const build = path.join(repo, 'tmp/staging-build/browser');
if (!lstatSync(path.join(build, 'index.html')).isFile()) throw Error('Build frontend to tmp/staging-build first.');
const base = path.join(repo, 'tmp/staging');
mkdirSync(base, { recursive: true });
if (realpathSync(base) !== base) throw Error('Staging must not resolve through a link.');
const root = path.join(base, 'run-' + randomUUID());
privateBackupDirectory(root);
const files = [];
function copyTree(source, destination, allowed) {
  if (lstatSync(source).isSymbolicLink()) throw Error('Source links are not accepted.');
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.name.includes('.pre-migration-') || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const from = path.join(source, entry.name), to = path.join(destination, entry.name);
    if (entry.isSymbolicLink()) throw Error('Source links are not accepted.');
    if (entry.isDirectory()) { copyTree(from, to, allowed); continue; }
    if (!allowed.has(path.extname(entry.name).toLowerCase())) continue;
    if (entry.name.endsWith('.html')) writeFileSync(to, stagingBanner(readFileSync(from, 'utf8')));
    else copyFileSync(from, to);
    files.push({ path: path.relative(root, to), sha256: createHash('sha256').update(readFileSync(to)).digest('hex') });
  }
}
copyTree(path.join(repo, 'backend/src'), path.join(root, 'backend/src'), new Set(['.js']));
const publicExtensions = new Set(['.html','.css','.js','.json','.png','.jpg','.jpeg','.webp','.svg','.gif','.txt','.wasm','.woff','.woff2','.docx','.pdf']);
copyTree(path.join(repo, 'frontend/public'), path.join(root, 'frontend/public'), publicExtensions);
copyTree(build, path.join(root, 'frontend/dist/duranki-login/browser'), publicExtensions);
mkdirSync(path.join(root, 'scripts'));
for (const name of ['staging-server.mjs','staging-support.mjs','staging-check.mjs','staging-permission-check.mjs']) copyFileSync(path.join(repo, 'scripts', name), path.join(root, 'scripts', name));
copyFileSync(path.join(repo, 'backend/package.json'), path.join(root, 'backend/package.json'));
// Share installed code dependencies only. No data, environment, upload or database directory is linked.
symlinkSync(path.join(repo, 'backend/node_modules'), path.join(root, 'backend/node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
const accounts = [];
for (const [i, [name, roles]] of accountSpecs.entries()) {
  const password = randomBytes(24).toString('base64url');
  accounts.push({ name, roles, telephoneNumber: '000000' + String(1001+i), password, passwordHash: await hashPassword(password) });
}
mkdirSync(path.join(root, 'backend/data'));
writeFileSync(path.join(root, 'backend/data/platform-store.json'), JSON.stringify(stagingState(accounts), null, 2), { flag: 'wx', mode: 0o600 });
writeFileSync(path.join(root, 'accounts.private.json'), JSON.stringify(accounts.map(({ passwordHash, ...account }) => account), null, 2), { flag: 'wx', mode: 0o600 });
writeFileSync(path.join(root, 'runtime.private.json'), JSON.stringify({ jwt: randomBytes(32).toString('hex'), pepper: randomBytes(32).toString('hex') }), { flag: 'wx', mode: 0o600 });
writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ kind: stagingKind, root, createdAt: new Date().toISOString(), storage: 'isolated-json-sqlite', syntheticAccounts: accounts.length, files }, null, 2), { flag: 'wx' });
if (!process.argv.includes('--keep-latest')) writeFileSync(path.join(base, 'latest.json'), JSON.stringify({ root }, null, 2));
console.log(JSON.stringify({ root, accounts: accounts.length, copiedFiles: files.length, storage: 'isolated-json-sqlite', liveDataCopied: false, paymentCollection: false }));

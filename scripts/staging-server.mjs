import { readFileSync, lstatSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stagingEnvironment, stagingKind } from './staging-support.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
if (manifest.kind !== stagingKind || manifest.root !== root || !path.basename(root).startsWith('run-') || path.basename(path.dirname(root)) !== 'staging') throw Error('Refusing to run outside a prepared staging directory.');
for (const relative of ['backend/src','backend/data','frontend/public','frontend/dist/duranki-login/browser']) {
  const target = path.join(root, relative);
  if (lstatSync(target).isSymbolicLink() || realpathSync(target) !== target) throw Error('Staging data and source must not be linked to live directories.');
}
const port = Number(process.argv[2] || 4300);
const secrets = JSON.parse(readFileSync(path.join(root, 'runtime.private.json'), 'utf8'));
const environment = stagingEnvironment(root, port, secrets);
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, environment);
process.chdir(path.join(root, 'backend'));
const { createApp } = await import('../backend/src/app.js');
const app = createApp({ databaseAvailable: false });
await app.locals.storageReady;
// An independent listener prevents using the live API or its origin-scoped browser credentials.
const server = app.listen(port, '127.0.0.1', () => {
  writeFileSync(path.join(root, 'running.json'), JSON.stringify({ kind: stagingKind, pid: process.pid, port, root, url: `http://127.0.0.1:${port}`, startedAt: new Date().toISOString() }, null, 2));
  console.log(JSON.stringify({ environment: stagingKind, url: `http://127.0.0.1:${port}`, storage: 'isolated-json-sqlite', realPayments: false }));
});
server.on('error', () => { console.error('Staging port unavailable; no existing process was stopped.'); process.exit(1); });

import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { stagingEnvironment } from './staging-support.mjs';

const root = realpathSync(process.argv[2]), port = 4309;
const read = name => JSON.parse(readFileSync(path.join(root, name)));
assert.equal(read('manifest.json').root, root);
assert.equal(read('manifest.json').kind, 'duranki-isolated-rehearsal-v1');
assert.equal(read('sql-isolated/prepared.json').syntheticOnly, true);
const sql = read('sql-isolated/app.private.json');
assert.equal(sql.root, root); assert.equal(sql.port, 13308);
assert.equal(sql.database, 'duranki_synthetic_acceptance');
const env = stagingEnvironment(root, port, read('runtime.private.json'));
Object.assign(env, { DB_PORT: String(sql.port), DB_USER: sql.user, DB_PASSWORD: sql.password, DB_NAME: sql.database });
for (const key of ['PLATFORM', 'AUTH', 'TREASURY', 'TRAINING', 'CYCLE', 'HERITAGE']) env[key + '_STORAGE'] = 'mariadb';
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, env);
process.chdir(path.join(root, 'backend'));
const { getPool } = await import(pathToFileURL(path.join(root, 'backend/src/database.js')));
const [[identity]] = await getPool().query('SELECT @@port AS port,@@datadir AS data');
assert.equal(Number(identity.port), sql.port);
assert.equal(realpathSync(identity.data).toLowerCase(), realpathSync(sql.data).toLowerCase());
const { createApp } = await import(pathToFileURL(path.join(root, 'backend/src/app.js')));
// The supported business routes use SQL document identity, not the legacy relational routes.
const app = createApp({ databaseAvailable: false });
await app.locals.storageReady;
const server = app.listen(port, '127.0.0.1', () => {
  writeFileSync(path.join(root, 'running.json'), JSON.stringify({ root, port, pid: process.pid, sql: true }));
  console.log(JSON.stringify({ status: 'SQL_ACCEPTANCE_LISTENING', port }));
});
server.on('error', () => process.exit(1));

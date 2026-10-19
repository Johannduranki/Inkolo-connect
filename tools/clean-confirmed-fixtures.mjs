import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { cleanConfirmedFixtures } from '../backend/src/mock-data-cleanup.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = path.join(root, 'backend/data');
const file = path.join(data, 'platform-store.json');
const { state, report } = cleanConfirmedFixtures(JSON.parse(fs.readFileSync(file, 'utf8')));
for (const name of ['treasury', 'heritage']) {
  const db = new DatabaseSync(path.join(data, `${name}.sqlite`), { readOnly: true });
  report[name] = {};
  for (const { name: table } of db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()) {
    report[name][table] = db.prepare(`SELECT count(*) AS n FROM "${table.replaceAll('"', '""')}"`).get().n;
  }
  db.close();
}
if (process.argv.includes('--apply')) {
  const { createConnection } = await import('node:net');
  const running = await new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port: 3000 });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', error => error.code === 'ECONNREFUSED' ? resolve(false) : reject(error));
  });
  if (running) throw new Error('Stop the API before applying this migration.');
  const backup = path.join(data, 'backups', `real-data-cleanup-${new Date().toISOString().replaceAll(':', '-')}`);
  fs.mkdirSync(backup, { recursive: true });
  for (const entry of fs.readdirSync(data, { withFileTypes: true })) if (entry.isFile()) fs.copyFileSync(path.join(data, entry.name), path.join(backup, entry.name));
  fs.writeFileSync(`${file}.cleanup.tmp`, JSON.stringify(state, null, 2));
  fs.renameSync(`${file}.cleanup.tmp`, file);
  fs.writeFileSync(path.join(data, 'import-mode.json'), JSON.stringify({ demoUsersDisabled: true, realDataOnly: true }));
  report.backup = backup;
  fs.writeFileSync(path.join(backup, 'cleanup-report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));

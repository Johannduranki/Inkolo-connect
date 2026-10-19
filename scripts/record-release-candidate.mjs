import { readdirSync, readFileSync, writeFileSync, lstatSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const repo = realpathSync(process.cwd());
const output = realpathSync(process.argv[2]);
if (!output.startsWith(path.join(repo, 'tmp') + path.sep)) throw Error('Use an isolated output directory under tmp.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function inventory(base, entries) {
  const result = [];
  function visit(relative) {
    const absolute = path.join(base, relative), stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) throw Error('Candidate inputs must not contain symbolic links.');
    if (stat.isDirectory()) {
      for (const name of readdirSync(absolute).sort()) visit(path.join(relative, name));
    } else if (stat.isFile()) result.push({ path: relative.replaceAll('\\', '/'), bytes: stat.size, sha256: hash(readFileSync(absolute)) });
  }
  for (const entry of entries) visit(entry);
  return { sha256: hash(JSON.stringify(result)), files: result };
}
// Explicit source roots exclude environment files, databases, uploads and logs.
const sources = inventory(repo, ['backend/src', 'backend/package.json', 'backend/package-lock.json', 'frontend/src', 'frontend/public', 'frontend/package.json', 'frontend/package-lock.json', 'frontend/angular.json']);
const frontendRoot = process.argv[3] || 'frontend';
if (!['frontend', 'browser'].includes(frontendRoot)) throw Error('Choose frontend or browser artifact folder.');
const frontend = inventory(output, [frontendRoot]);
const manifest = {
  recordedAt: new Date().toISOString(), approved: false,
  scope: 'Local frontend build and selected source fingerprint only. Not a complete deployable backend artifact or proof of reproducibility.',
  build: 'Angular production candidate; consult the acceptance report for build results and warnings.',
  sources, frontend
};
writeFileSync(path.join(output, 'candidate-manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ sourceSha256: sources.sha256, frontendSha256: frontend.sha256, frontendFiles: frontend.files.length, approved: false }));

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = args => {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { console.error('Security scan could not read Git metadata; captured output withheld.'); process.exit(2); }
};
const tracked = new Set(git(['ls-files', '-z']).split('\0').filter(Boolean));
const files = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
const findings = [];
const patterns = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['aws-access-key', /\bAKIA[A-Z0-9]{16}\b/],
  ['embedded-jwt', /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{20,}\b/]
];
for (const file of files) {
  if (tracked.has(file) && /^(backend\/data\/.*\.(json|sqlite|key)|.*(?:^|\/)\.env)$/.test(file)) findings.push({ file, rule: 'tracked-runtime-data-or-environment', severity: 'HIGH' });
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute) || fs.statSync(absolute).size > 5 * 1024 * 1024) continue;
  const text = fs.readFileSync(absolute, 'utf8');
  for (const [rule, regex] of patterns) if (regex.test(text)) findings.push({ file, rule, severity: 'HIGH' });
}
// History is inspected in memory; only object identifiers and rule names leave the scanner.
let historyCommits = 0;
if (process.argv.includes('--history')) {
  for (const commit of git(['rev-list', '--all']).trim().split('\n').filter(Boolean)) {
    historyCommits++;
    const diff = git(['show', '--format=', '--no-ext-diff', '--no-textconv', '--unified=0', commit]);
    for (const [rule, regex] of patterns) if (regex.test(diff)) findings.push({ commit, rule, severity: 'HIGH' });
  }
}
console.log(JSON.stringify({ files: files.length, historyCommits, findings, limitations: 'Pattern scan only; generic passwords, ignored files, large files and deleted historical binary secrets require manual review.' }, null, 2));
if (process.argv.includes('--check') && findings.length) process.exitCode = 1;

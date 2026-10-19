import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'frontend/package.json'));
const ts = require('typescript');
const rows = [], mounts = [];
for (const name of fs.readdirSync(path.join(root, 'backend/src')).filter(n => n.endsWith('.js') && !n.includes('pre-migration'))) {
  const filename = `backend/src/${name}`;
  const source = ts.createSourceFile(filename, fs.readFileSync(path.join(root, filename), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const receiver = node.expression.expression.getText(source);
      const first = node.arguments[0];
      if (first && ts.isStringLiteral(first) && first.text.startsWith('/')) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        if (['get', 'post', 'put', 'patch', 'delete', 'all', 'head', 'options'].includes(method)) {
          const guards = node.arguments.slice(1).filter(ts.isIdentifier).map(n => n.text).join(', ') || 'inline/inherited; review';
          rows.push(`| ${method.toUpperCase()} ${first.text} | ${filename}:${line} | ${guards} | Review | Review | Review | Review | Review | Review | Review |`);
        } else if (method === 'use') mounts.push(`- ${filename}:${line}: ${receiver}.use(${first.text})`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
const output = `# API Security Matrix\n\nGenerated ${new Date().toISOString()}. ${rows.length} literal route declarations in active backend/src JavaScript.\n\nThis is an inventory, NOT a completed endpoint authorization certification. Router paths are relative to mounts below. Dynamic routes and reverse-proxy paths require manual review. 'Review' means unverified, never pass. Named guards are evidence pointers, not authorization conclusions.\n\n| Method / router path | Source | Named guards | Roles | Tenant | Community | Ownership | Validation | Rate limiting | Sensitive data / audit |\n|---|---|---|---|---|---|---|---|---|---|\n${rows.join('\n')}\n\n## Mounts\n${mounts.join('\n')}\n`;
fs.mkdirSync(path.join(root, 'docs/security'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs/security/API_SECURITY_MATRIX.md'), output);
console.log(JSON.stringify({ routeDeclarations: rows.length, mounts: mounts.length }));

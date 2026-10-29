import {readFile, writeFile, mkdir, copyFile, access, symlink, lstat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import {memberCapabilities} from '../public/member-service-catalogue.js';

const frontend = fileURLToPath(new URL('../', import.meta.url));

export const staticRoutes = {
  '/dashboard/funeral-cover': 'funeral-cover.html',
  '/dashboard/funeral-application': 'funeral-application.html',
  '/two-factor': 'two-factor.html',
  '/join-community': 'join-community.html',
  '/payments/cycle': 'cycle.html',
  '/dashboard/wholesaler-orders': 'wholesaler-orders.html',
  '/dashboard/community-reports': 'community-reports.html',
  '/dashboard/service-pricing': 'service-pricing.html',
  '/dashboard/trader-training': 'trader-training.html',
  '/dashboard/branding': 'branding.html',
  '/dashboard/heritage': 'heritage.html',
  '/dashboard/treasury': 'treasury.html',
  '/dashboard/users': 'user-directory.html',
  '/dashboard/tenant': 'tenant-access.html',
  '/dashboard/cycle': 'cycle.html'
};

export function angularPaths(source) {
  const file = ts.createSourceFile('app.routes.ts', source, ts.ScriptTarget.Latest, true);
  const result = new Set();
  function visit(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(file) === 'path' && ts.isStringLiteral(node.initializer)) {
      const route = node.initializer.text;
      if (route && route !== '**') {
        if (!/^[a-z0-9/-]+$/.test(route)) throw Error('Static build requires an explicit route: ' + route);
        result.add('/' + route);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return [...result];
}

export function entryHtml(source, dashboard = false) {
  // Use absolute asset resolution and normalize the directory URL synchronously.
  let html = source.replace(/<head([^>]*)>/i, '<head$1><script src="/static-route-entry.js"></script>');
  if (!/<base\s/i.test(html)) html = html.replace(/<head([^>]*)>/i, '<head$1><base href="/">');
  if (dashboard) {
    html = html.replace('</head>', '<link rel="stylesheet" href="/admin-responsive.css"></head>');
    html = html.replace('</body>', '<script src="/presence.js" data-presence-client="true" defer></script></body>');
  }
  return html;
}

export async function buildStaticRoutes(output, routeSource) {
  const root = path.resolve(output);
  const index = await readFile(path.join(root, 'index.html'), 'utf8');
  const routes = Object.fromEntries(angularPaths(routeSource).map(route => [route, 'index.html']));
  Object.assign(routes, staticRoutes);
  for (const code of Object.keys(memberCapabilities)) routes['/dashboard/services/' + code] = 'service-unavailable.html';
  for (const code of ['trader-training', 'grant-distribution']) routes['/dashboard/services/' + code] = 'trader-training.html';

  // Resolve every input first: missing assets fail the build, never a deployment.
  const pages = new Map([['index.html', index]]);
  for (const file of new Set(Object.values(routes))) if (!pages.has(file)) pages.set(file, await readFile(path.join(root, file), 'utf8'));
  await access(path.join(root, 'static-route-entry.js'));
  for (const [route, file] of Object.entries(routes)) {
    const directory = path.resolve(root, '.' + route);
    if (!directory.startsWith(root + path.sep)) throw Error('Route escapes build directory');
    await mkdir(directory, {recursive: true});
    const html = entryHtml(pages.get(file), file !== 'index.html' && route.startsWith('/dashboard/'));
    if (process.platform === 'win32') {
      await writeFile(path.join(directory, 'index.html'), html);
    } else {
      // CI discovers the root with find -type f -name index.html. Relative
      // in-directory links keep nested entries out of that search; tar and
      // the workflow's cp -a preserve them for Apache's default FollowSymLinks.
      await writeFile(path.join(directory, 'page.html'), html);
      const entry = path.join(directory, 'index.html');
      try { await symlink('page.html', entry); }
      catch (error) { if (error.code !== 'EEXIST' || !(await lstat(entry)).isSymbolicLink()) throw error; }
    }
  }
  await writeFile(path.join(root, 'static-route-manifest.json'), JSON.stringify(routes, null, 2) + '\n');
  return routes;
}

async function main() {
  const angular = JSON.parse(await readFile(path.join(frontend, 'angular.json'), 'utf8'));
  const configured = angular.projects['duranki-login'].architect.build.options.outputPath;
  const base = typeof configured === 'string' ? configured : configured.base;
  const browser = typeof configured === 'string' ? 'browser' : configured.browser ?? 'browser';
  const output = path.resolve(frontend, base, browser);
  await copyFile(path.join(frontend, 'node_modules/cytoscape/dist/cytoscape.min.js'), path.join(output, 'heritage-cytoscape.js'));
  const routes = await buildStaticRoutes(output, await readFile(path.join(frontend, 'src/app/app.routes.ts'), 'utf8'));
  // The unchanged CI workflow discovers the archive root with this exact find.
  // Never let a nested page accidentally become the deployed document root.
  if (process.platform !== 'win32') {
    const first = execFileSync('find', [path.resolve(frontend, base), '-type', 'f', '-name', 'index.html', '-print', '-quit'], {encoding: 'utf8'}).trim();
    if (first !== path.join(output, 'index.html')) throw Error('CI archive discovery did not select the Angular document root');
  }
  console.log(`Prepared ${Object.keys(routes).length} Apache page entries in ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();

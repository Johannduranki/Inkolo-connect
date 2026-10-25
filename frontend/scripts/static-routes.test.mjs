import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, copyFile, rm, stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {angularPaths, buildStaticRoutes, staticRoutes, entryHtml} from './static-routes.mjs';

const frontend = new URL('../', import.meta.url);
test('all explicit Angular routes are discovered, including role-protected dashboards', async () => {
  const routes = angularPaths(await readFile(new URL('src/app/app.routes.ts', frontend), 'utf8'));
  for (const route of ['/login','/dashboard/platform-admin','/dashboard/member','/dashboard/accounting','/community']) assert.ok(routes.includes(route));
  assert.ok(!routes.includes('/**'));
  assert.throws(() => angularPaths("const routes=[{path:'../unsafe'}]"));
});

test('entry normalization preserves tenant/community query, fragment and history state without reload', async () => {
  const script = await readFile(new URL('public/static-route-entry.js', frontend), 'utf8');
  for (const pathname of ['/login/','/dashboard/tenant/','/two-factor/index.html']) {
    const state = {navigationId: 9};
    const calls = [];
    vm.runInNewContext(script, {location: {pathname, search:'?tenantId=tenant-test&communityId=community-test', hash:'#section'}, history:{state, replaceState:(...args)=>calls.push(args)}});
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], state);
    assert.equal(calls[0][2], pathname.replace(/\/index\.html$/, '').replace(/\/$/, '') + '?tenantId=tenant-test&communityId=community-test#section');
  }
  vm.runInNewContext(script, {location:{pathname:'/login'},history:{replaceState:()=>assert.fail('Canonical path must not change')}});
});

test('static build preserves Angular guards and uses the correct standalone pages', async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'duranki-route-test-'));
  try {
    const index = '<html><head><base href="/"></head><body><app-root></app-root><script src="main.js" type="module"></script></body></html>';
    await writeFile(path.join(output,'index.html'), index);
    for (const file of new Set([...Object.values(staticRoutes), 'service-unavailable.html', 'static-route-entry.js'])) await copyFile(new URL('public/' + file, frontend), path.join(output,file));
    const routes = await buildStaticRoutes(output, await readFile(new URL('src/app/app.routes.ts', frontend),'utf8'));
    assert.equal(await readFile(path.join(output,'index.html'),'utf8'), index);
    for (const [route, file] of Object.entries(routes)) {
      const entry = await readFile(path.join(output,route.slice(1),'index.html'),'utf8');
      assert.ok(entry.includes('/static-route-entry.js'), route);
      assert.ok(entry.includes('<base href="/">'), route);
      assert.equal(entry.includes('<app-root>'), file === 'index.html', route);
      assert.ok(!route.startsWith('/api/') && !route.startsWith('/uploads/'));
    }
    assert.match(await readFile(path.join(output,'two-factor/index.html'),'utf8'), /two-factor.js/);
    assert.match(await readFile(path.join(output,'dashboard/service-pricing/index.html'),'utf8'), /service-pricing.js/);
    assert.match(await readFile(path.join(output,'dashboard/tenant/index.html'),'utf8'), /presence.js/);
    assert.equal(routes['/dashboard/services/trader-training'], 'trader-training.html');
    assert.equal(routes['/dashboard/services/grant-distribution'], 'trader-training.html');
    assert.ok((await stat(path.join(output,'dashboard/platform-admin/index.html'))).isFile());
    if (process.platform !== 'win32') {
      const indexes = execFileSync('find',[output,'-type','f','-name','index.html'],{encoding:'utf8'}).trim();
      assert.equal(indexes, path.join(output,'index.html'), 'Existing CI must discover only the build root');
    }
  } finally { await rm(output,{recursive:true,force:true}); }
});

test('normalizer is before application scripts and does not duplicate Angular base', () => {
  const html = entryHtml('<html><head><base href="/"><script src="app.js"></script></head><body></body></html>');
  assert.equal((html.match(/<base /g)||[]).length,1);
  assert.ok(html.indexOf('static-route-entry.js') < html.indexOf('app.js'));
});

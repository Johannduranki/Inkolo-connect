import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL('../../frontend/src/app/' + path, import.meta.url), 'utf8');

test('role select uses the Angular select accessor when asynchronous options arrive', () => {
  const path = 'shared/components/role-switcher/role-switcher.component';
  assert.match(source(path + '.ts'), /imports: \[[^\]]*AsyncPipe, FormsModule[^\]]*\]/);
  assert.match(source(path + '.html'), /\[ngModel\]="activeRole\$ \| async"/);
  assert.doesNotMatch(source(path + '.html'), /\[value\]="activeRole\$ \| async"/);
});

test('empty catalogue does not claim unconfigured services are all active', () => {
  const template = source('dashboard.component.html');
  assert.doesNotMatch(template, /All services are active/);
  assert.match(template, /No additional services available/);
  assert.match(template, /@if \(subscribedServices\(\)\.length > 0\)/);
  assert.match(template, /No services are currently available for this community/);
});

test('accounting route is guarded and no longer uses fabricated financing repayments', () => {
  assert.match(source('app.routes.ts'), /path: 'dashboard\/accounting'/);
  assert.match(source('app.routes.ts'), /roles: \['Platform Admin', 'Accountant'\]/);
  assert.doesNotMatch(source('features/accounting/accounting-dashboard.component.html'), /26500/);
  assert.match(source('features/accounting/accounting-dashboard.component.ts'), /token !== this.auth.getToken\(\)/);
});
test('member selection and catalogue use returned scope, not cached administrative configuration', () => {
  const dashboard = source('dashboard.component.ts');
  assert.match(dashboard, /getMemberCommunity\(String\(user.id\), this.route.snapshot.queryParamMap.get\('communityId'\)/);
  assert.match(dashboard, /this.memberCommunity\(\)\?\.serviceConfiguration/);
  assert.doesNotMatch(dashboard, /localStorage.getItem\('duranki_platform_(communities|tenants)'\)/);
  const switcher = source('shared/components/role-switcher/role-switcher.component.ts');
  assert.match(switcher, /filter\(row => row.joined\)/);
  assert.match(switcher, /this.communities\(\).some/);
});

test('member sign-out remains available in the mobile header', () => {
  const css = source('dashboard.component.css');
  assert.doesNotMatch(css, /\.avatar,\s*\.sign-out\s*\{\s*display:\s*none/);
  assert.match(css, /\.sign-out\s*\{\s*display:\s*inline-flex/);
  assert.match(source('dashboard.component.html'), /\(click\)="logout\(\)"\>\{\{ "Sign out" \| translate \}\}/);
});

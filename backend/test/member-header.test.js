import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`../../frontend/${name}`, import.meta.url), 'utf8');

test('member header keeps account actions and compact language selection', () => {
  const header = read('src/app/dashboard.component.html').split('</header>')[0];
  assert.match(header, /class="topbar member-header"/);
  assert.match(header, /app-language-selector \[compact\]="true"/);
  assert.match(header, /\(click\)="profileOpen.set\(true\)"/);
  assert.match(header, /\(click\)="logout\(\)"/);
  assert.doesNotMatch(header, /resetServices\(\)/);
  assert.ok(header.indexOf('app-role-switcher') < header.indexOf('class="account"'));
});

test('header stylesheet is shipped independently and protects narrow community controls', () => {
  assert.match(read('src/index.html'), /href="\/member-header.css"/);
  const css = read('public/member-header.css');
  assert.match(css, /@media\(max-width:640px\)/);
  assert.match(css, /app-role-switcher label \{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(css, /box-sizing:border-box;min-width:0/);
});

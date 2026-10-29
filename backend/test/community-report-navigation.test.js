import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../../frontend/public/community-reports.js', import.meta.url), 'utf8');
const communities = ['a', 'b'].map(id => ({ id, name: id.toUpperCase(), tenantId: 'tenant-' + id, aliases: ['alias-' + id] }));
const settle = () => new Promise(resolve => setImmediate(resolve));
async function screen(query, allowed = communities, members = []) {
  const elements = new Map(), requests = [], payment = { href: '/payments/cycle' + query };
  const make = () => ({ value: '', children: [], get options() { return this.children; }, textContent: '', append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children = children; } });
  const get = id => { if (!elements.has(id)) elements.set(id, make()); return elements.get(id); };
  const select = get('community');
  select.append = option => { select.children.push(option); if (!select.value) select.value = option.value; };
  let address = new URL('http://staging.test/dashboard/community-reports' + query);
  vm.runInNewContext(script, {
    document: { getElementById: get, createElement: make, querySelectorAll: () => [payment] },
    location: { get href() { return address.href; }, get search() { return address.search; } },
    history: { state: null, replaceState(_state, _title, url) { address = new URL(url, address); } },
    URL, URLSearchParams, Date, sessionStorage: { getItem: () => 'synthetic' }, localStorage: { getItem: () => null },
    fetch: async url => {
      requests.push(url);
      if (!url.includes('?')) return { ok: true, json: async () => ({ communities: allowed }) };
      const id = new URL(url, address).searchParams.get('communityId');
      return { ok: true, json: async () => ({ community: allowed.find(c => c.id === id), generatedAt: new Date().toISOString(), summary: {}, totals: [], payments: [], members, notes: [] }) };
    }
  });
  await settle();
  return { get, payment, requests, address: () => address };
}

test('foreign community fallback normalizes the report URL and existing payment link', async () => {
  const ui = await screen('?communityId=b&from=member', [communities[0]]);
  assert.equal(ui.address().searchParams.get('communityId'), 'a');
  assert.equal(ui.address().searchParams.get('tenantId'), 'tenant-a');
  assert.equal(ui.address().searchParams.get('from'), 'member');
  assert.equal(ui.payment.href, '/payments/cycle' + ui.address().search);
  assert.equal(ui.requests.length, 2);
  assert.match(ui.requests[1], /communityId=a/);
  assert.equal(ui.get('report').hidden, false);
});

test('aliases and subsequent community changes keep the navigation scope aligned', async () => {
  const ui = await screen('?communityId=alias-b');
  assert.equal(ui.address().searchParams.get('communityId'), 'b');
  ui.get('community').value = 'a';
  ui.get('community').onchange();
  await settle();
  assert.equal(ui.address().searchParams.get('communityId'), 'a');
  assert.equal(ui.address().searchParams.get('tenantId'), 'tenant-a');
  assert.equal(ui.payment.href, '/payments/cycle' + ui.address().search);
});

test('selection is limited to the filtered tenant and empty scopes make no report request', async () => {
  const filtered = await screen('?tenantId=tenant-a&communityId=b');
  assert.equal(filtered.get('community').value, 'a');
  const empty = await screen('?tenantId=tenant-b&communityId=b', [communities[0]]);
  assert.equal(empty.requests.length, 1);
  assert.equal(empty.address().search, '');
  assert.equal(empty.payment.href, '/payments/cycle');
  assert.match(empty.get('notice').textContent, /No communities available/);
});

test('address region and town are member filters, not community selection or access changes', async () => {
  const ui = await screen('', [communities[0]], [
    { id: '1', name: 'Synthetic One', region: 'Gauteng', city: 'Pretoria', services: [] },
    { id: '2', name: 'Synthetic Two', region: 'Gauteng', city: 'Johannesburg', services: [] },
    { id: '3', name: 'Synthetic Three', region: '', city: '', services: [] }
  ]);
  assert.equal(ui.get('members').children.length, 3);
  ui.get('region').value = 'Gauteng'; ui.get('region').onchange();
  assert.equal(ui.get('members').children.length, 2);
  ui.get('city').value = 'Pretoria'; ui.get('city').onchange();
  assert.equal(ui.get('members').children.length, 1);
  assert.equal(ui.get('members').children[0].children[0].textContent, 'Synthetic One');
  ui.get('region').value = 'Not provided'; ui.get('city').value = ''; ui.get('region').onchange();
  assert.equal(ui.get('members').children[0].children[0].textContent, 'Synthetic Three');
  assert.equal(ui.requests.length, 2); assert.equal(ui.get('community').value, 'a');
});

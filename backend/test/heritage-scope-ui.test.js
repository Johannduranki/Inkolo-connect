import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../frontend/public/heritage.js', import.meta.url), 'utf8');
// Execute the real loading functions separately from the canvas and form bindings.
const loading = source.slice(0, source.indexOf('const people='));
const empty = () => ({ people: [], trees: [], relationships: [], leadership: [], succession: [], documents: [] });
function harness() {
  const elements = new Map(), pending = [];
  const get = id => {
    if (!elements.has(id)) elements.set(id, { value: '', textContent: '', hidden: false, disabled: false,
      elements: { tenant_enabled: {}, enabled: {} }, children: [],
      replaceChildren() { this.children = []; this.value = ''; this.textContent = ''; },
      append(child) { this.children.push(child); if (!this.value) this.value = child.value; }
    });
    return elements.get(id);
  };
  const context = vm.createContext({ document: { querySelector: get, querySelectorAll: () => [], createElement: () => ({}) },
    ResizeObserver: class { observe() {} }, location: { search: '' }, URLSearchParams, FormData,
    sessionStorage: { getItem: () => 'synthetic-token' }, localStorage: { getItem: () => null },
    render() {}, fetch: url => new Promise(resolve => pending.push({ url, resolve }))
  });
  vm.runInContext(loading, context);
  vm.runInContext("access={scopes:['a','b','disabled'].map(id=>({community_id:id,tenant_enabled:true,enabled:id!=='disabled'}))}", context);
  return { get, pending, data: () => JSON.parse(vm.runInContext('JSON.stringify(data)', context)),
    load: id => { get('#scope').value = id; return vm.runInContext('load()', context); } };
}
const response = data => ({ ok: true, headers: { get: () => 'application/json' }, json: async () => data });

test('Heritage ignores an older community response and clears prior private details immediately', async () => {
  const h = harness();
  h.get('#details').textContent = 'old private details'; h.get('#path-result').textContent = 'old relationship';
  const a = h.load('a'), b = h.load('b');
  assert.equal(h.get('#details').textContent, ''); assert.equal(h.get('#path-result').textContent, '');
  assert.deepEqual(h.data(), empty());
  h.pending[1].resolve(response({ ...empty(), trees: [{ tree_id: 'b-tree', name: 'B' }] })); await b;
  h.pending[0].resolve(response({ ...empty(), trees: [{ tree_id: 'a-tree', name: 'A' }] })); await a;
  assert.equal(h.data().trees[0].tree_id, 'b-tree');
  assert.equal(h.get('#tree').value, 'b-tree');
});

test('Heritage keeps a disabled scope empty even when an earlier request completes', async () => {
  const h = harness(), a = h.load('a'); await h.load('disabled');
  h.pending[0].resolve(response({ ...empty(), trees: [{ tree_id: 'a-tree', name: 'A' }] })); await a;
  assert.deepEqual(h.data(), empty()); assert.equal(h.get('#new-person').disabled, true);
});

test('Heritage suppresses stale errors but propagates the current request failure', async () => {
  const h = harness(), a = h.load('a'), b = h.load('b');
  h.pending[0].resolve({ ok: false, json: async () => ({ message: 'Old error' }) }); await a;
  h.pending[1].resolve({ ok: false, json: async () => ({ message: 'Current error' }) });
  await assert.rejects(b, /Current error/); assert.deepEqual(h.data(), empty());
});

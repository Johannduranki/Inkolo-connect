import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from '../../frontend/node_modules/typescript/lib/typescript.js';
import rx from '../../frontend/node_modules/rxjs/dist/cjs/index.js';

const base = '../../frontend/src/app/';
const providerPath = 'features/service-provider/service-provider-dashboard/service-provider-dashboard.component.ts';
const memberPath = 'features/member/my-documents/my-documents.component.ts';
const servicePath = 'features/service-provider/services/service-provider-document.service.ts';
const source = path => readFileSync(new URL(base + path, import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function load(path, injections) {
  const exports = {};
  class FormControl { constructor(value) { this.value = value; } setValue(value) { this.value = value; } reset(value) { this.value = value; } }
  const signal = initial => { let value = initial; const read = () => value; read.set = next => { value = next; }; return read; };
  const compiled = ts.transpileModule(source(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true } }).outputText;
  vm.runInNewContext(compiled, { exports, FormData, require: name => {
    if (name === '@angular/core') return { Component: () => x => x, Injectable: () => x => x, Input: () => () => {}, inject: token => injections[token], signal };
    // Normalize the VM's object prototype for RxJS's plain-object overload.
    if (name === 'rxjs') return { ...rx, forkJoin: sources => rx.forkJoin({ ...sources }) };
    if (name === '@angular/forms') return { FormControl };
    return new Proxy({}, { get: (_, key) => key });
  } });
  return exports;
}
function provider() {
  const requests = [];
  let token = 'one';
  const service = { getWorkspace: () => { const result = new rx.Subject(); requests.push(result); return result; } };
  const { ServiceProviderDashboardComponent } = load(providerPath, { AuthService: { getToken: () => token }, ServiceProviderDocumentService: service });
  return { component: new ServiceProviderDashboardComponent(), requests, changeToken: () => { token = 'two'; } };
}
const scope = { serviceProviderId: 'p', tenantId: 'a', communityId: 'c', serviceCodes: ['funeral-cover'] };
const workspace = { scopes: [scope], documents: [{ id: 'doc', memberId: '1', fileName: 'one.pdf', serviceProviderId: 'p', tenantId: 'a', communityId: 'c' }] };

test('provider page uses returned scope, clears records before reload and fails closed', () => {
  const { component: c, requests } = provider();
  c.refresh(); requests[0].next(workspace);
  assert.equal(c.selectedScope().serviceProviderId, 'p'); assert.equal(c.visibleDocuments().length, 1);
  c.refresh(); assert.deepEqual(plain(c.documents()), []); assert.equal(c.selectedScope(), null);
  requests[1].error({ status: 403 }); assert.ok(c.error()); assert.equal(c.loading(), false);
  assert.deepEqual(plain(c.scopes()), []);
});

test('provider page ignores superseded responses and clears private records on destroy', () => {
  const { component: c, requests, changeToken } = provider();
  c.refresh(); c.refresh(); requests[0].next(workspace); assert.equal(c.documents().length, 0);
  changeToken(); requests[1].next(workspace); assert.equal(c.documents().length, 0);
  c.refresh(); requests[2].next(workspace); assert.equal(c.documents().length, 1);
  c.ngOnDestroy(); assert.equal(c.documents().length, 0); assert.equal(c.scopes().length, 0);
});

test('provider scope switching filters document rows and resets upload fields', () => {
  const { component: c, requests } = provider();
  c.refresh(); requests[0].next({ scopes: [scope, { ...scope, communityId: 'd' }], documents: workspace.documents });
  c.memberId.setValue('1'); c.selectScope('1');
  assert.equal(c.visibleDocuments().length, 0); assert.equal(c.memberId.value, '');
  c.selectScope('not-an-index'); assert.equal(c.selectedScope(), null);
});

test('provider service sends explicit scope and rejects untrusted download URLs before HTTP', async () => {
  const calls = [];
  const http = { post: (url, body) => { calls.push({ url, body }); return rx.of({}); }, get: url => { calls.push({ url }); return rx.of(new Blob()); } };
  const { ServiceProviderDocumentService } = load(servicePath, { HttpClient: http });
  const service = new ServiceProviderDocumentService();
  service.uploadMemberPolicyDocument('member', 'funeral-cover', new Blob(['synthetic']), scope);
  assert.equal(calls[0].body.get('serviceProviderId'), 'p');
  assert.equal(calls[0].body.get('tenantId'), 'a'); assert.equal(calls[0].body.get('communityId'), 'c');
  for (const fileUrl of ['https://example.test/steal', '//example.test/steal', '/uploads/member-documents/../secret', '/uploads/member-documents/a.pdf?token=secret']) {
    await assert.rejects(rx.firstValueFrom(service.download({ fileUrl })), /Invalid document/);
  }
  assert.equal(calls.length, 1);
  await rx.firstValueFrom(service.download({ fileUrl: '/uploads/member-documents/abc-123.pdf' }));
  assert.equal(calls.length, 2);
});

test('legacy provider workspace no longer advertises fabricated live data or local invoice submissions', () => {
  const code = source(providerPath);
  assert.doesNotMatch(code, /sp-001|liveVumaRevenue|setInterval|Math.random|localStorage|generateInvoice|submitInvoice/);
  assert.match(source(providerPath.replace('.ts', '.html')), /Not connected/);
});

test('member documents clear immediately on identity changes, errors and destruction', () => {
  const documents = [], agreements = [];
  const request = list => { const result = new rx.Subject(); list.push(result); return result; };
  const { MyDocumentsComponent } = load(memberPath, {
    AuthService: { getToken: () => 'one' },
    ServiceProviderDocumentService: { getMemberDocuments: () => request(documents) },
    LegalAgreementService: { getMyAgreements: () => request(agreements) }
  });
  const c = new MyDocumentsComponent(); c.memberId = 1; c.ngOnChanges();
  documents[0].next([{ id: 'old' }]); documents[0].complete(); agreements[0].next([]); agreements[0].complete();
  assert.equal(c.documents().length, 1);
  c.memberId = 2; c.ngOnChanges(); assert.equal(c.documents().length, 0);
  documents[1].error({ status: 403 }); assert.ok(c.error()); assert.equal(c.loading(), false);
  c.ngOnDestroy(); assert.equal(c.documents().length, 0); assert.equal(c.agreements().length, 0);
});

test('MFA platform destination resolves before the wildcard and retains both authorization guards', () => {
  const { routes } = load('app.routes.ts', {});
  const index = routes.findIndex(route => route.path === 'dashboard/platform-admin');
  assert.ok(index >= 0 && index < routes.findIndex(route => route.path === '**'));
  const route = routes[index];
  assert.equal(route.component, 'PlatformOverviewComponent');
  assert.equal(route.data.role, 'Platform Admin');
  assert.deepEqual(plain(route.canActivate), ['authGuard', 'roleGuard']);
});

test('platform landing uses current server directories and does not seed browser-local tenants', () => {
  const requests = [];
  const get = () => { const response = new rx.Subject(); requests.push(response); return response; };
  const { PlatformOverviewComponent } = load('features/platform-admin/platform-overview.component.ts', {
    HttpClient: { get }, AuthService: { getProfile: get, getToken: () => 'one' }
  });
  const component = new PlatformOverviewComponent(); component.load();
  requests[0].next({ firstName: 'Synthetic', lastName: 'Admin' }); requests[0].complete();
  requests[1].next([{ id: 'a', name: 'Tenant A' }]); requests[1].complete();
  requests[2].next([{ kind: 'community', id: 'c', tenantId: 'a' }, { kind: 'community', id: 'foreign', tenantId: 'b' }]); requests[2].complete();
  assert.deepEqual(plain(component.tenants()), [{ id: 'a', name: 'Tenant A' }]);
  assert.deepEqual(component.communities().map(row => row.id), ['c']);
  component.load(); assert.equal(component.tenants().length, 0);
  requests[3].error({ status: 401 }); assert.ok(component.error());
  component.ngOnDestroy(); assert.equal(component.communities().length, 0);
  assert.doesNotMatch(source('features/platform-admin/platform-overview.component.ts'), /localStorage|defaultTenants|defaultCommunities/);
});

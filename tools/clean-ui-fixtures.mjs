// Mechanical AST migration: preserve the live bundle's unrelated authentication changes.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
const root = path.resolve(import.meta.dirname, '..');
const platform = 'frontend/src/app/features/platform-admin/platform-admin-dashboard/platform-admin-dashboard.component.ts';
const accounting = 'frontend/src/app/features/accounting/accounting-dashboard.component.ts';
const provider = 'frontend/src/app/features/service-provider/services/service-provider.service.ts';
const revenue = 'frontend/src/app/features/kzncc-admin/services/kzncc-revenue.service.ts';
const bundle = 'frontend/dist/duranki-login/browser/main-4DAPJI7G.js';
const original = fs.readFileSync(path.join(root, platform), 'utf8');
if (original.includes('function durankiCleanTenants')) throw new Error('Migration already applied.');
const prefix = original.slice(0, original.indexOf('@Component')).replace(/^import .*?;\r?\n/gms, '');
const context = {};
vm.runInNewContext(ts.transpile(prefix + '\nglobalThis.defaults = {defaultTenants,defaultCommunities};'), context);
const old = JSON.parse(JSON.stringify(context.defaults));
const tenants = old.defaultTenants.filter(t => t.id !== 'tenant-evolve').map(t => ({
  ...t, companyName: t.name, registrationNumber: '', contactPerson: '', email: '', telephone: '', address: '',
  website: t.id === 'tenant-zuc' ? 'https://www.zuc.co.za' : '', subdomain: '',
  tenantAdmin: {name:'',email:'',telephone:''}, pricing: Object.fromEntries(Object.keys(t.pricing).map(k => [k,0])),
  settings: {...t.settings,billingModel:'Not configured'},
  websiteConfig: {...t.websiteConfig,address:'',email:'',telephone:'',socialLinks:''}
}));
const trader = old.defaultCommunities.find(c => c.id === 'community-ilembe-traders');
const communities = [
  {...trader, administrator:'',contactDetails:'',members:0,users:0,transactions:0,projects:0},
  { ...trader,id:'community-zuc',tenantId:'tenant-zuc',name:'ZUC Community',type:'Church',administrator:'',contactDetails:'',description:'',serviceCodes:[],members:0,users:0,transactions:0,projects:0 },
  { ...trader,id:'community-core-inkolo',tenantId:'tenant-inkolo',name:'Inkolo Connect',type:'General',administrator:'',contactDetails:'',description:'',serviceCodes:[],members:0,users:0,transactions:0,projects:0 }
];
// Unknown/custom records are retained; only reviewed fixture IDs are archived.
const helper = `
function durankiArchiveUi(key: string, rows: any): void {
  const archive = 'duranki_cleanup_archive_v1_' + key;
  if (!localStorage.getItem(archive)) localStorage.setItem(archive, JSON.stringify(rows));
}
function durankiCleanTenants(rows: any[], defaults: any[]): any[] {
  const samples: any[] = ${JSON.stringify(old.defaultTenants)};
  durankiArchiveUi('tenants', rows);
  const cleaned = rows.filter(t => t.id !== 'tenant-evolve').map(t => {
    const sample = samples.find(s => s.id === t.id);
    const clean = defaults.find(s => s.id === t.id);
    if (!sample || !clean) return t;
    const next = {...t};
    for (const key of ['companyName','registrationNumber','contactPerson','email','telephone','address','website','subdomain','tenantAdmin','pricing','settings','websiteConfig']) {
      if (JSON.stringify(next[key]) === JSON.stringify(sample[key])) next[key] = clean[key];
    }
    return next;
  });
  for (const value of defaults) if (!cleaned.some(t => t.id === value.id || t.name?.trim().toLowerCase() === value.name.toLowerCase())) cleaned.push(value);
  return cleaned;
}
function durankiCleanCommunities(rows: any[], defaults: any[]): any[] {
  const removed = ${JSON.stringify(old.defaultCommunities.filter(c => c.id !== trader.id).map(c=>c.id))};
  durankiArchiveUi('communities', rows);
  const cleaned = rows.filter(c => !removed.includes(c.id) && c.tenantId !== 'tenant-evolve').map(c => ({...c, members:0,users:0,transactions:0,projects:0}));
  for (const value of defaults) if (!cleaned.some(c => c.id === value.id)) cleaned.push(value);
  return cleaned;
}
function durankiRefreshDirectory(owner: any): void {
  const token = sessionStorage.getItem('duranki_access_token') || localStorage.getItem('duranki_access_token');
  if (!token) return;
  fetch('/api/platform/admin/import-directory',{headers:{Authorization:'Bearer '+token},cache:'no-store'})
    .then(response => {if(!response.ok) throw new Error('Directory unavailable'); return response.json();})
    .then(data => {
      owner.platformUsers.set(data.users);
      owner.communities.update((rows: any[]) => rows.map(c => {
        const record = data.communities.find((x: any) => (x.platformCommunityId || x.id) === c.id);
        return {...c, users:record?.users || 0, members:record?.users || 0};
      }));
    }).catch(() => owner.notice.set('Member totals could not be loaded.'));
}
`;
const emptyAccounting = new Set(['ledgerEntries','receivables','payables','loans','employees','supplierInvoices','tenantInvoices','fundMovements']);
const files = [platform, accounting, provider, revenue, bundle];
const changes = [];
for (const relative of files) {
  const text = fs.readFileSync(path.join(root, relative), 'utf8');
  const compiled = relative === bundle;
  const ast = ts.createSourceFile(relative, text, ts.ScriptTarget.Latest, true, compiled ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  const edits = [];
  const replace = (node, value) => edits.push({start:node.getStart(ast),end:node.end,value});
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isArrayLiteralExpression(node.initializer)) {
      const value = node.initializer.getText(ast);
      if (value.includes('tenant-ingwe-connect') && value.includes('tenant-evolve')) replace(node.initializer,JSON.stringify(tenants));
      else if (value.includes('community-inkolo-kzn') && value.includes('community-ilembe-traders')) replace(node.initializer,JSON.stringify(communities));
    }
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      const names = new Set(node.members.map(m => m.name?.getText(ast)));
      const isPlatform = names.has('ensureDefaultTenants');
      const isAccounting = names.has('loadAccountingData');
      const isProvider = names.has('getServiceProviderDashboardSummary');
      const isRevenue = names.has('getPaidServices') && names.has('activity');
      for (const member of node.members) {
        const name = member.name?.getText(ast);
        if (ts.isMethodDeclaration(member) && member.body && isPlatform) {
          if (name === 'ensureDefaultTenants' || name === 'ensureDefaultCommunities') {
            const parameter = member.parameters[0].name.getText(ast);
            const isTenant = name === 'ensureDefaultTenants';
            const variable = compiled ? (isTenant ? 'Rh' : null) : (isTenant ? 'defaultTenants' : 'defaultCommunities');
            // Resolve the minified community constant through its AST declaration.
            let resolved = variable;
            if (!resolved) { const find = n => {if(ts.isVariableDeclaration(n)&&n.initializer&&ts.isArrayLiteralExpression(n.initializer)&&n.initializer.getText(ast).includes('community-inkolo-kzn')) resolved=n.name.getText(ast); ts.forEachChild(n,find);}; find(ast); }
            if (!resolved) throw new Error('Community default identifier not found.');
            replace(member.body,`{return durankiClean${isTenant?'Tenants':'Communities'}(${parameter},${resolved}).map(value=>this.normalize${isTenant?'Tenant':'Community'}(value));}`);
          }
          if (name === 'refreshOnlineUsers') replace(member.body,'{durankiRefreshDirectory(this);}');
        }
        if (!ts.isPropertyDeclaration(member) || !member.initializer) continue;
        if (isPlatform && name === 'platformUsers') {
          const signalMember=node.members.find(m=>m.name?.getText(ast)==='onlineUsers');
          replace(member.initializer,signalMember.initializer.getText(ast));
        }
        if (isPlatform && ['grantDistributionBatches','uifTrainingModules'].includes(name)) {
          replace(member.initializer,compiled?'[]':name==='grantDistributionBatches'?'[] as {name:string;traders:number;amount:number;paid:number;status:string}[]':'[] as {title:string;learners:number;completed:number;status:string}[]');
        }
        if (isAccounting && emptyAccounting.has(name) && ts.isCallExpression(member.initializer)) replace(member.initializer.arguments[0],'[]');
        if (isAccounting && ['cash','assets'].includes(name)) replace(member.initializer,member.initializer.getText(ast).replace(/1846250\s*\+/,'').replace(/\+\s*980000/,''));
        if ((isProvider && name==='members') || (isRevenue && name==='activity')) replace(member.initializer,'[]');
      }
    }
    ts.forEachChild(node,visit);
  }
  visit(ast);
  if (!edits.length) throw new Error('No matching fixture nodes: '+relative);
  let result=text;
  for(const edit of edits.sort((a,b)=>b.start-a.start)) result=result.slice(0,edit.start)+edit.value+result.slice(edit.end);
  if (relative===platform) result+='\n'+helper;
  if (compiled) result=ts.transpile(helper,{target:ts.ScriptTarget.ES2022})+'\n'+result;
  changes.push({relative,text,result,edits:edits.length});
}
const backup=path.join(root,'tmp/ui-before-real-data-cleanup');
for(const change of changes){
  const destination=path.join(backup,change.relative);fs.mkdirSync(path.dirname(destination),{recursive:true});
  if(fs.existsSync(destination))throw new Error('Backup already exists; refuse overwrite.');
  fs.writeFileSync(destination,change.text);fs.writeFileSync(path.join(root,change.relative),change.result);
  console.log(change.relative,change.edits);
}

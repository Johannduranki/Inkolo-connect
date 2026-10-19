// Narrow compatibility build step until the restored Angular source replaces
// the older served bundle. Refuse unknown bundle layouts rather than corrupting it.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'frontend/src/app/features/platform-admin/platform-admin-dashboard/platform-admin-dashboard.component.ts'),'utf8');
const ast=ts.createSourceFile('tenants.ts',source,ts.ScriptTarget.Latest,true);
let tenant;
function visit(node){
  if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='defaultTenants'){
    const entry=node.initializer.elements.find(e=>e.getText(ast).includes('"id": "tenant-ingwe-connect"'));
    if(entry)tenant=JSON.parse(entry.getText(ast));
  }
  ts.forEachChild(node,visit);
}
visit(ast);
if(!tenant||tenant.name!=='Ingwe Connect')throw new Error('Ingwe source default missing.');
const file=path.join(root,'frontend/dist/duranki-login/browser/main-4DAPJI7G.js');
const original=fs.readFileSync(file,'utf8');
const anchor='Rh=[{id:"tenant-inkolo"';
const guard='return[...Rh.filter(u=>!o.has(u.id)).map(u=>this.normalizeTenant(u)),...r]';
const replacement='if(r.some(u=>u.name.trim().toLowerCase()==="ingwe connect"))o.add("tenant-ingwe-connect");'+guard;
let result=original;
const literal=JSON.stringify(tenant);
if(!result.includes('Rh=['+literal+',')){
  if(result.split(anchor).length!==2)throw new Error('Unexpected tenant array: manual review required.');
  result=result.replace(anchor,'Rh=['+literal+',{id:"tenant-inkolo"');
}
if(!result.includes(replacement)){
  if(result.split(guard).length!==2)throw new Error('Unexpected tenant merge: manual review required.');
  result=result.replace(guard,replacement);
}
if(process.argv.includes('--check')){
  if(result!==original)throw new Error('Served bundle is missing the Ingwe default.');
}else if(result!==original){
  const backup=path.join(root,'tmp/main-before-ingwe-default.js');
  fs.mkdirSync(path.dirname(backup),{recursive:true});
  if(!fs.existsSync(backup))fs.copyFileSync(file,backup);
  fs.writeFileSync(file,result);
}
console.log('Ingwe default and duplicate guard verified.');

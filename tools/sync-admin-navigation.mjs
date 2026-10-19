import fs from 'node:fs';
import path from 'node:path';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
const file=path.resolve(import.meta.dirname,'../frontend/dist/duranki-login/browser/main-4DAPJI7G.js');
const text=fs.readFileSync(file,'utf8');
const marker='/* admin-scope-navigation */';
if(!text.includes(marker)){
  const ast=ts.createSourceFile('bundle.js',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let position;
  const visit=node=>{if(ts.isClassExpression(node)||ts.isClassDeclaration(node)){if(node.members.some(m=>m.name?.getText(ast)==='ensureDefaultTenants')){const init=node.members.find(m=>m.name?.getText(ast)==='ngOnInit');position=init.body.getStart(ast)+1;}}ts.forEachChild(node,visit);};visit(ast);
  if(!position)throw new Error('Platform dashboard initializer not found.');
  fs.mkdirSync(path.resolve(import.meta.dirname,'../tmp'),{recursive:true});
  fs.writeFileSync(path.resolve(import.meta.dirname,'../tmp/main-before-admin-navigation.js'),text);
  const added=marker+'const scope=new URLSearchParams(location.search);if(scope.has("communityId"))this.openCommunityById(scope.get("communityId"));else if(scope.has("tenantId"))this.openTenantById(scope.get("tenantId"));';
  fs.writeFileSync(file,text.slice(0,position)+added+text.slice(position));
}
console.log('Admin tenant/community deep links installed.');

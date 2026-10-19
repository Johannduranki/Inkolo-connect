import fs from 'node:fs';
import path from 'node:path';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
const file=path.resolve(import.meta.dirname,'../frontend/dist/duranki-login/browser/main-4DAPJI7G.js');
const source=fs.readFileSync(file,'utf8');
const ast=ts.createSourceFile('bundle.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),edits=[];
const labels=new Map([['Enter Tenant','Tenant Admin Dashboard'],['Enter Community','Community Admin Dashboard']]);
function visit(node){if(ts.isStringLiteral(node)&&labels.has(node.text.trim()))edits.push({start:node.getStart(ast),end:node.end,text:JSON.stringify(labels.get(node.text.trim()))});ts.forEachChild(node,visit);}
visit(ast);
let result=source;for(const edit of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,edit.start)+edit.text+result.slice(edit.end);
if(edits.length){const backup=path.resolve(import.meta.dirname,'../tmp/main-before-admin-dashboard-labels.js');if(!fs.existsSync(backup))fs.writeFileSync(backup,source);fs.writeFileSync(file,result);}
console.log(`Updated ${edits.length} dashboard button labels.`);

import fs from 'node:fs';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
const file='frontend/dist/duranki-login/browser/main-4DAPJI7G.js';
const source=fs.readFileSync(file,'utf8');
const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const matches=[];
function visit(node){if(ts.isMethodDeclaration(node)&&node.name.getText(ast)==='loadTenantForEdit')matches.push(node);ts.forEachChild(node,visit);}
visit(ast);
if(matches.length!==1)throw Error('Expected exactly one tenant edit handler.');
const method=matches[0];
if(method.getText(ast).includes('scrollIntoView')){console.log('Tenant editor focus already installed.');process.exit(0);}
const code=";requestAnimationFrame(()=>{const editor=document.querySelector('.platform-page .form-panel');if(!editor)return;editor.scrollIntoView({block:'start',behavior:'auto'});editor.querySelector('input')?.focus({preventScroll:true});});";
fs.mkdirSync('tmp',{recursive:true});
if(!fs.existsSync('tmp/main-before-tenant-editor-focus.js'))fs.copyFileSync(file,'tmp/main-before-tenant-editor-focus.js');
const offset=method.body.end-1;
fs.writeFileSync(file,source.slice(0,offset)+code+source.slice(offset));
console.log('Tenant Edit now scrolls to the loaded form and focuses its name.');

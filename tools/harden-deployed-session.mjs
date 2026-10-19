import fs from 'node:fs';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
const file = 'frontend/dist/duranki-login/browser/main-4DAPJI7G.js';
const source = fs.readFileSync(file, 'utf8');
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const edits = [];
let found = 0;
function visit(node) {
  if (ts.isMethodDeclaration(node) && node.name.getText(ast) === 'logout' && node.getText(ast).includes('this.inMemoryToken')) {
    found++;
    if (!node.getText(ast).includes('/api/auth/logout')) edits.push({ at: node.body.getStart(ast) + 1, text: 'const securityToken=this.getToken();if(securityToken)fetch("/api/auth/logout",{method:"POST",headers:{Authorization:"Bearer "+securityToken},keepalive:true}).catch(()=>{});' });
  }
  ts.forEachChild(node, visit);
}
visit(ast);
if (found !== 1) throw new Error('Unexpected deployed authentication structure; no bundle changes made.');
let output = source;
for (const edit of edits.sort((a,b) => b.at-a.at)) output = output.slice(0,edit.at)+edit.text+output.slice(edit.at);
fs.writeFileSync(file, output);
console.log('Deployed logout now requests server-side session revocation.');

import fs from 'node:fs';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';

const path='frontend/dist/duranki-login/browser/main-4DAPJI7G.js';
let source=fs.readFileSync(path,'utf8');
const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const edits=[];
function visit(node) {
  if(ts.isMethodDeclaration(node)) {
    const name=node.name.getText(ast), original=node.getText(ast);
    let replacement;
    if(name==='login' && original.includes('/auth/login') && !original.includes('duranki_mfa_challenge')) {
      replacement=original.replace('rt(({accessToken:o})=>this.storeToken(o))','rt(({accessToken:o,mfaRequired:m})=>{if(m){this.inMemoryToken=null;sessionStorage.setItem("duranki_mfa_challenge",o);sessionStorage.removeItem(this.tokenKey);localStorage.removeItem(this.tokenKey)}else{sessionStorage.removeItem("duranki_mfa_challenge");this.storeToken(o)}})');
    }
    if(name==='submit' && original.includes('this.auth.login') && original.includes('next:({user:n})=>this.completeLogin(n)')) {
      replacement=original.replace('next:({user:n})=>this.completeLogin(n)','next:({user:n,mfaRequired:m})=>{if(m){window.location.replace("/two-factor");return}this.completeLogin(n)}');
    }
    if(replacement && replacement!==original) edits.push({start:node.getStart(ast),end:node.end,text:replacement});
  }
  ts.forEachChild(node,visit);
}
visit(ast);
if(edits.length!==2 && !(edits.length===0&&source.includes('mfaRequired:m})=>{if(m){window.location.replace("/two-factor")')))throw Error(`Expected two MFA repairs; found ${edits.length}`);
fs.mkdirSync('tmp',{recursive:true});
const backup='tmp/main-before-mfa-handoff.js';
if(!fs.existsSync(backup))fs.copyFileSync(path,backup);
for(const edit of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
fs.writeFileSync(path,source);
console.log(`Applied ${edits.length} explicit MFA handoff repairs.`);

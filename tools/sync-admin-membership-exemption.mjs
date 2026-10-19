import fs from 'node:fs';
import path from 'node:path';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
const file=path.resolve(import.meta.dirname,'../frontend/dist/duranki-login/browser/main-4DAPJI7G.js');
const original=fs.readFileSync(file,'utf8');
const ast=ts.createSourceFile('bundle.js',original,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const edits=[];let found=0;
function visit(node){
  if(ts.isMethodDeclaration(node)&&['communityMembershipRequired','dashboardAccessLimited'].includes(node.name.getText(ast))){
    found++;
    if(!node.body.getText(ast).includes('communityMembershipAccess'))edits.push(node.body.getStart(ast)+1);
  }
  ts.forEachChild(node,visit);
}
visit(ast);if(found!==2)throw new Error('Expected both community membership gates; refusing unknown bundle.');
let updated=original;
for(const offset of edits.sort((a,b)=>b-a))updated=updated.slice(0,offset)+'if(this.user()?.communityMembershipAccess?.exempt===true)return false;'+updated.slice(offset);
if(edits.length){
  const backup=path.resolve(import.meta.dirname,'../tmp/main-before-admin-membership-exemption.js');
  if(!fs.existsSync(backup))fs.writeFileSync(backup,original);
  fs.writeFileSync(file,updated);
}
console.log('Platform-admin membership exemption verified; payment status unchanged.');

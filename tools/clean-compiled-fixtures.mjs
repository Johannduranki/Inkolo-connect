import fs from 'node:fs';
import path from 'node:path';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
const file=path.resolve(import.meta.dirname,'../frontend/dist/duranki-login/browser/main-4DAPJI7G.js');
const text=fs.readFileSync(file,'utf8');
const ast=ts.createSourceFile('bundle.js',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const edits=[];
const accounting=new Set(['ledgerEntries','receivables','payables','loans','employees','supplierInvoices','tenantInvoices','fundMovements']);
function visit(node){
  if(ts.isClassExpression(node)||ts.isClassDeclaration(node)){
    const names=new Set(node.members.map(m=>m.name?.getText(ast)));
    const platform=names.has('ensureDefaultTenants'),finance=names.has('loadAccountingData'),provider=names.has('getServiceProviderDashboardSummary'),revenue=names.has('getPaidServices')&&text.slice(node.pos,node.end).includes('this.activity=');
    function fields(n){
      if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.EqualsToken&&ts.isPropertyAccessExpression(n.left)&&n.left.expression.kind===ts.SyntaxKind.ThisKeyword){
        const name=n.left.name.text,rhs=n.right;let replacement;
        if(platform&&['grantDistributionBatches','uifTrainingModules'].includes(name))replacement='[]';
        if(platform&&name==='platformUsers')replacement='w(0)';
        if(finance&&accounting.has(name)&&ts.isCallExpression(rhs))replacement=rhs.expression.getText(ast)+'([])';
        if(finance&&['cash','assets'].includes(name))replacement=rhs.getText(ast).replace(/1846250\s*\+/,'').replace(/\+\s*980000/,'');
        if(provider&&name==='members'||revenue&&name==='activity')replacement='[]';
        if(replacement!==undefined)edits.push({start:rhs.getStart(ast),end:rhs.end,value:replacement});
      }
      ts.forEachChild(n,fields);
    }
    fields(node);return;
  }
  ts.forEachChild(node,visit);
}
visit(ast);
let result=text;for(const e of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,e.start)+e.value+result.slice(e.end);
const check=ts.createSourceFile('check.js',result,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
if(check.parseDiagnostics.length)throw new Error('Bundle parse failed.');
fs.writeFileSync(file,result);console.log('Compiled fixture fields removed:',edits.length);

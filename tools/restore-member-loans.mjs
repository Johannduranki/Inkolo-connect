import fs from 'node:fs';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';

const file='frontend/dist/duranki-login/browser/main-4DAPJI7G.js';
const source=fs.readFileSync(file,'utf8');
const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const edits=[];let catalogues=0,handlers=0;
const loan={code:'loans',name:'Loans',description:'Loan applications are not yet connected. This service is awaiting setup.',image:'/service-wallet.png',accent:'#007c94',tag:'Finance',availability:'coming-soon',billingNote:'Loan applications, approvals and payouts are not yet available.',plans:[]};
function visit(node){
  if(ts.isArrayLiteralExpression(node)&&ts.isBinaryExpression(node.parent)&&node.parent.left.getText(ast)==='this.services'){
    const codes=node.elements.filter(ts.isObjectLiteralExpression).map(o=>o.properties.find(p=>p.name?.text==='code')?.initializer?.text);
    if(codes.includes('vas-services')){catalogues++;if(!codes.includes('loans'))edits.push({start:node.getStart(ast)+1,end:node.getStart(ast)+1,text:JSON.stringify(loan)+','});}
  }
  if(ts.isMethodDeclaration(node)&&node.name.getText(ast)==='openService'&&node.getText(ast).includes('this.selectedService.set')){
    handlers++;
    if(!node.getText(ast).includes('loan applications, approvals and payouts')){
      const param=node.parameters[0].name.getText(ast);
      edits.push({start:node.body.getStart(ast)+1,end:node.body.getStart(ast)+1,text:`if(${param}.code==='loans'){window.alert('Loans is enabled for this community, but loan applications, approvals and payouts are not yet connected.');return;}`});
    }
  }
  ts.forEachChild(node,visit);
}
visit(ast);
if(catalogues!==1||handlers!==1)throw Error('Unexpected member catalogue shape; bundle unchanged.');
fs.mkdirSync('tmp',{recursive:true});
if(!fs.existsSync('tmp/main-before-member-loans.js'))fs.copyFileSync(file,'tmp/main-before-member-loans.js');
let output=source;for(const edit of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,edit.start)+edit.text+output.slice(edit.end);
fs.writeFileSync(file,output);
console.log('Restored Loans member card; existing tenant and community availability gates preserved.');

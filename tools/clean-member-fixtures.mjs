import fs from 'node:fs';
import path from 'node:path';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
const root=path.resolve(import.meta.dirname,'..');
const files=['frontend/src/app/community.component.ts','frontend/src/app/dashboard.component.ts','frontend/src/app/core/services/wallet.service.ts','frontend/src/app/features/service-provider/services/service-provider-billing.service.ts','frontend/dist/duranki-login/browser/main-4DAPJI7G.js'];
for(const file of files){
  const text=fs.readFileSync(path.join(root,file),'utf8'),compiled=file.endsWith('.js');
  const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,compiled?ts.ScriptKind.JS:ts.ScriptKind.TS),edits=[];
  const replace=(n,value)=>edits.push({start:n.getStart(ast),end:n.end,value});
  function field(name,rhs){
    if(['chatMessages','announcements','events','walletTransactions','wallets','transactions','cycles'].includes(name)){
      const array=ts.isArrayLiteralExpression(rhs)?rhs:ts.isCallExpression(rhs)&&rhs.arguments[0]&&ts.isArrayLiteralExpression(rhs.arguments[0])?rhs.arguments[0]:null;
      if(array&&array.elements.length){
        // Only named, reviewed example collections, not arbitrary API results.
        const fixture=array.getText(ast);
        if(/Nandi|Thabo|New Born Church|Youth fellowship|Community payment received|member-1|kt-1|bc-2026|Sunday|Worship|Prayer/.test(fixture)){
          const value=!compiled&&name==='announcements'&&file.includes('community.component')?'[] as {category:string;title:string;summary:string;date:string;featured?:boolean}[]':'[]';
          replace(array,value);
        }
      }
    }
    if(name==='walletBalance'&&ts.isCallExpression(rhs)&&rhs.arguments[0]?.getText(ast)==='850')replace(rhs.arguments[0],'0');
    if(name==='memberDirectory'&&ts.isNewExpression(rhs)&&rhs.arguments?.[0]?.getText(ast).includes('Jeremy Shabalala'))replace(rhs.arguments[0],'[]');
  }
  function visit(n){
    if(ts.isPropertyDeclaration(n)&&n.initializer)field(n.name.getText(ast),n.initializer);
    if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.EqualsToken&&ts.isPropertyAccessExpression(n.left)&&n.left.expression.kind===ts.SyntaxKind.ThisKeyword)field(n.left.name.text,n.right);
    if(ts.isMethodDeclaration(n)&&n.body&&['getChurchWalletSummary','getBishopWalletSummary','getKznccRevenueWalletSummary','payTithe','requestWalletPayout'].includes(n.name.getText(ast))){
      // Return an error instead of presenting fabricated financial reports or success.
      let observable='of';
      if(compiled){const find=x=>{if(ts.isReturnStatement(x)&&x.expression&&ts.isCallExpression(x.expression)){
        let call=x.expression;if(ts.isPropertyAccessExpression(call.expression)&&call.expression.name.text==='pipe')call=call.expression.expression;
        if(ts.isCallExpression(call))observable=call.expression.getText(ast);
      }ts.forEachChild(x,find);};find(n.body);}
      replace(n.body,`{return new ${compiled?'('+observable+'().constructor)':'Observable'}(subscriber=>subscriber.error(new Error('This function requires a connected, reconciled financial ledger.')));}`);return;
    }
    ts.forEachChild(n,visit);
  }
  visit(ast);let result=text;
  for(const e of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,e.start)+e.value+result.slice(e.end);
  const backup=path.join(root,'tmp/ui-before-real-data-cleanup',file);
  fs.mkdirSync(path.dirname(backup),{recursive:true});if(!fs.existsSync(backup))fs.writeFileSync(backup,text);
  fs.writeFileSync(path.join(root,file),result);console.log(file,edits.length);
}

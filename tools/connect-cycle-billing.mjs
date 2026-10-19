import fs from 'node:fs';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
const file='frontend/dist/duranki-login/browser/main-4DAPJI7G.js',source=fs.readFileSync(file,'utf8');
const ast=ts.createSourceFile(file,source,99,true,1),edits=[];let open=0,subscriptions=0,wallet=0;
function visit(n){if(ts.isMethodDeclaration(n)){
  const name=n.name.getText(ast),text=n.getText(ast);
  if(name==='openService'&&text.includes('this.selectedService.set')){open++;const p=n.parameters[0].name.getText(ast);if(!text.includes('cycle-billing-entry'))edits.push({start:n.body.getStart(ast)+1,end:n.body.getStart(ast)+1,text:`/* cycle-billing-entry */if(['Payment setup required','Cycle Pay checkout'].includes(${p}.catalogueStatus)&&!this.isServiceActive(${p})){const community=this.memberCommunity()?.churchId??this.requestedCommunityId;window.location.assign('/payments/cycle?service='+encodeURIComponent(${p}.canonicalCode||${p}.code)+(community?'&communityId='+encodeURIComponent(community):''));return;}`});else edits.push({start:n.getStart(ast),end:n.end,text:text.replace(`${p}.catalogueStatus==='Payment setup required'`,`['Payment setup required','Cycle Pay checkout'].includes(${p}.catalogueStatus)`)});}
  if(name==='getSubscriptions'&&text.includes('/subscriptions')){subscriptions++;if(!text.includes('communityId='))edits.push({start:n.getStart(ast),end:n.end,text:text.replace('/subscriptions`',"/subscriptions?communityId=${encodeURIComponent(new URLSearchParams(location.search).get('communityId')||'')}`")});}
  if(text.includes('this.walletService.topUpWithCycle')&&!text.includes('cycle-wallet-entry')){wallet++;const start=text.lastIndexOf('this.walletActionLoading.set(',text.indexOf('this.walletService.topUpWithCycle'));if(start<0)throw Error('Wallet handler not recognised');edits.push({start:n.getStart(ast)+start,end:n.end,text:`/* cycle-wallet-entry */window.location.assign('/payments/cycle?purpose=wallet-top-up&communityId='+encodeURIComponent(this.memberCommunity()?.churchId??this.requestedCommunityId??''));}`});}
}ts.forEachChild(n,visit);}
visit(ast);if(open!==1||subscriptions!==1)throw Error('Unexpected checkout entry points.');
fs.mkdirSync('tmp',{recursive:true});if(!fs.existsSync('tmp/main-before-cycle-billing.js'))fs.copyFileSync(file,'tmp/main-before-cycle-billing.js');
let output=source;for(const e of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,e.start)+e.text+output.slice(e.end);fs.writeFileSync(file,output);console.log({open,subscriptions,wallet,edits:edits.length});

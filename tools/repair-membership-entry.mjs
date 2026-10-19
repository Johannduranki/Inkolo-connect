import fs from 'node:fs';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';

const file='frontend/dist/duranki-login/browser/main-4DAPJI7G.js';
const source=fs.readFileSync(file,'utf8');
const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const edits=[];
const exempt='if(this.user()?.communityMembershipAccess?.exempt===true){const id=this.memberCommunity()?.churchId??this.requestedCommunityId;window.location.assign("/community"+(id?"?communityId="+encodeURIComponent(id):""));return;}';
const unavailable='Community membership payment is not connected yet. No payment or subscription has been recorded. Please contact your community administrator.';
let found=0;
function visit(node){
  if(ts.isMethodDeclaration(node)){
    const name=node.name.getText(ast),text=node.getText(ast);
    if(name==='openService' && text.includes('this.selectedService.set')){
      found++;
      if(!text.includes('communityMembershipAccess'))edits.push({start:node.body.getStart(ast)+1,end:node.body.getStart(ast)+1,text:'if(n.code==="community-membership"){'+exempt+'}'});
    }
    if(name==='payCommunityMembershipFromWallet' && text.includes('this.selectedService')){
      found++;
      edits.push({start:node.getStart(ast),end:node.end,text:'payCommunityMembershipFromWallet(){'+exempt+'this.subscriptionError.set('+JSON.stringify(unavailable)+');}'});
    }
    if(name==='confirmSubscription' && text.includes('this.selectedService')){
      found++;
      if(!text.includes('Community membership payment is not connected'))edits.push({start:node.body.getStart(ast)+1,end:node.body.getStart(ast)+1,text:'if(this.selectedService()?.code==="community-membership"){'+exempt+'this.subscriptionError.set('+JSON.stringify(unavailable)+');return;}'});
    }
  }
  if(ts.isStringLiteral(node)){
    const replacements=new Map([
      ['Pay by Card','Card payment unavailable'],
      ['Pay from Wallet','Wallet payment unavailable'],
      ['Pay from your Duranki Wallet if you have balance, or pay by bank card. Once paid, the full community dashboard and enabled services are unlocked.','Community membership collection is not connected yet. Contact your community administrator. No payment will be recorded.'],
      ['Card payment is recorded through the current Duranki subscription flow. A live payment gateway can be connected later.','Payment collection requires a configured provider and verified server confirmation.']
    ]);
    // Limit replacements to membership-specific template functions.
    let parent=node.parent;while(parent&&!ts.isFunctionDeclaration(parent))parent=parent.parent;
    if(parent&&parent.getText(ast).includes('communityMembership')&&replacements.has(node.text))edits.push({start:node.getStart(ast),end:node.end,text:JSON.stringify(replacements.get(node.text))});
  }
  ts.forEachChild(node,visit);
}
visit(ast);
if(found!==3)throw Error('Expected three membership entry methods; bundle was not changed.');
fs.mkdirSync('tmp',{recursive:true});
if(!fs.existsSync('tmp/main-before-membership-entry.js'))fs.copyFileSync(file,'tmp/main-before-membership-entry.js');
let output=source;
for(const edit of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,edit.start)+edit.text+output.slice(edit.end);
fs.writeFileSync(file,output);
console.log('Repaired membership entry; no financial records changed.');

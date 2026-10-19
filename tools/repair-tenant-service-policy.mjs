import fs from 'node:fs';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
import { resolveCommunityConfiguration } from '../frontend/public/tenant-service-policy.js';
const file='frontend/dist/duranki-login/browser/main-4DAPJI7G.js';
const source=fs.readFileSync(file,'utf8');
const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const edits=[];let resolvers=0,gates=0;
function visit(node){
  if(ts.isMethodDeclaration(node)){
    const name=node.name.getText(ast);
    if(name==='configuredCommunityForMember'){
      resolvers++;
      edits.push({start:node.getStart(ast),end:node.end,text:`configuredCommunityForMember(member){try{return (${resolveCommunityConfiguration.toString()})(member,JSON.parse(localStorage.getItem(this.platformCommunitiesKey)||'[]'),JSON.parse(localStorage.getItem('duranki_platform_tenants')||'[]'));}catch{return null;}}`});
    }
    if(name==='serviceIsEnabledForMemberCommunity'){
      gates++;
      edits.push({start:node.getStart(ast),end:node.end,text:`serviceIsEnabledForMemberCommunity(code){if(code==='community')return true;const member=this.memberCommunity();const config=this.configuredCommunityForMember(member);if(!config)return false;const enabled=this.platformServiceCodes(code).some(alias=>config.serviceCodes.includes(alias));if(!enabled)return false;if(typeof this.dashboardAccessLimited==='function'&&this.dashboardAccessLimited()&&!['community-membership','wallet'].includes(code))return false;return true;}`});
    }
    if(name==='communityMembershipRequired'){
      edits.push({start:node.getStart(ast),end:node.end,text:`communityMembershipRequired(){if(this.user()?.communityMembershipAccess?.exempt===true)return false;const config=this.configuredCommunityForMember(this.memberCommunity()??{churchId:this.requestedCommunityId});return !!config?.serviceCodes?.some(code=>this.platformServiceCodes(code).includes('community-membership'));}`});
    }
  }
  ts.forEachChild(node,visit);
}
visit(ast);
if(resolvers!==2||gates!==2)throw Error('Unexpected configuration method count; bundle unchanged.');
fs.mkdirSync('tmp',{recursive:true});
if(!fs.existsSync('tmp/main-before-tenant-policy.js'))fs.copyFileSync(file,'tmp/main-before-tenant-policy.js');
let output=source;
for(const edit of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,edit.start)+edit.text+output.slice(edit.end);
fs.writeFileSync(file,output);
console.log('Tenant and community service lists now intersect; missing configuration fails closed.');

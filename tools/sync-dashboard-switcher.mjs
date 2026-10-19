import fs from 'node:fs';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
const file='frontend/dist/duranki-login/browser/main-4DAPJI7G.js';
let source=fs.readFileSync(file,'utf8');
const ast=ts.createSourceFile(file,source,99,true,ts.ScriptKind.JS),edits=[];
function visit(n){
  if(ts.isMethodDeclaration(n)&&n.name.getText(ast)==='selectedDestination'){
    edits.push({start:n.getStart(ast),end:n.end,text:`selectedDestination(role){const url=new URL(window.location.href);if(url.pathname==="/community"||url.pathname==="/dashboard/member"){const id=url.searchParams.get("communityId");if(id)return this.memberCommunities().some(c=>c.churchId===id)?"__community:"+id:"";if(url.pathname==="/community")return this.hasCommunityAccess()?"":"__member-services";}return role??"";}`});
  }
  if(ts.isMethodDeclaration(n)&&n.name.getText(ast)==='switchRole'&&n.getText(ast).includes('__community:')){
    edits.push({start:n.getStart(ast),end:n.end,text:`switchRole(event){const value=event.target.value;if(value.startsWith("__community:")){const id=value.slice(12);if(this.roles.setActiveRole("Member"))window.location.assign("/community?communityId="+encodeURIComponent(id));return;}if(value==="__member-services"){if(this.roles.setActiveRole("Member"))window.location.assign("/community");return;}if(value==="Member"&&this.hasCommunityAccess()){const community=this.memberCommunities()[0];if(this.roles.setActiveRole("Member"))window.location.assign("/community"+(community?"?communityId="+encodeURIComponent(community.churchId):""));return;}if(this.roles.setActiveRole(value))window.location.assign(this.roles.getDashboardRouteForRole(value));}`});
  }
  if(ts.isMethodDeclaration(n)&&n.name.getText(ast)==='setMemberCommunity'&&n.getText(ast).includes('this.churchSelection')){
    const old=n.getText(ast);
    edits.push({start:n.getStart(ast),end:n.end,text:old.replace('{','{if(n?.churchId){const url=new URL(window.location.href);if(!url.searchParams.has("communityId")){url.searchParams.set("communityId",n.churchId);window.history.replaceState(window.history.state,"",url.pathname+url.search);}}')});
  }
  ts.forEachChild(n,visit);
}
visit(ast);if(edits.length!==3)throw new Error('Unexpected switcher bundle structure');
fs.copyFileSync(file,'tmp/main-before-dashboard-switcher.js');
for(const edit of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
fs.writeFileSync(file,source);

import fs from 'node:fs';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
import {memberCapabilities,reconcileMemberCatalogue,enabledMemberService,scopedMemberCatalogue,programmeContext} from '../frontend/public/member-service-catalogue.js';
import {serviceCatalogue} from '../backend/src/service-pricing.js';
const file='frontend/dist/duranki-login/browser/main-4DAPJI7G.js',source=fs.readFileSync(file,'utf8');
const ast=ts.createSourceFile(file,source,99,true,1),edits=[];
const fallback=Object.entries(serviceCatalogue).map(([code,name])=>({code,name}));
const reconcile=`(existing,rows,loaded,context)=>{const memberCapabilities=${JSON.stringify(memberCapabilities)};return (${reconcileMemberCatalogue.toString()})(existing,rows,loaded,context);}`;
const loader=`loadConfiguredServicePrices(){const build=${reconcile};this.services=build(this.services,${JSON.stringify(fallback)},false);const token=sessionStorage.getItem('duranki_access_token')||localStorage.getItem('duranki_access_token')||'';const options={headers:{Authorization:'Bearer '+token},cache:'no-store'};Promise.all([fetch('/api/service-pricing',options).then(r=>{if(!r.ok)throw Error('Pricing unavailable');return r.json();}),fetch('/api/trader-training/access',options).then(r=>r.ok?r.json():null).catch(()=>null)]).then(([data,training])=>{this.services=build(this.services,data.services,true,(${programmeContext.toString()})(training,this.memberCommunity?.()?.churchId??this.requestedCommunityId));this.openRequestedService();}).catch(()=>{this.subscriptionError.set('Service status could not be loaded. Refresh to retry.');});}`;
let loaders=0,gates=0,openers=0,lists=0;
function visit(node){
  if(ts.isMethodDeclaration(node)){
    const name=node.name.getText(ast),text=node.getText(ast);
    if(name==='loadConfiguredServicePrices'){loaders++;edits.push({start:node.getStart(ast),end:node.end,text:loader});}
    if(name==='serviceIsEnabledForMemberCommunity'&&node.parent.getText(ast).includes('loadConfiguredServicePrices')){
      gates++;edits.push({start:node.getStart(ast),end:node.end,text:`serviceIsEnabledForMemberCommunity(code){const service=this.services.find(s=>s.code===code)||{code};return (${enabledMemberService.toString()})(service,this.configuredCommunityForMember(this.memberCommunity()??{churchId:this.requestedCommunityId}));}`});
    }
    if(name==='availableServices'&&text.includes('communityScopedServices')){lists++;edits.push({start:node.getStart(ast),end:node.end,text:"availableServices(){return this.communityScopedServices().filter(service=>!this.isServiceActive(service)&&!(service.code==='community-membership'&&this.user()?.communityMembershipAccess?.exempt===true))}"});}
    if(name==='communityScopedServices'&&node.parent.getText(ast).includes('loadConfiguredServicePrices'))edits.push({start:node.getStart(ast),end:node.end,text:`communityScopedServices(){const enabledMemberService=${enabledMemberService.toString()};return (${scopedMemberCatalogue.toString()})(this.services,this.configuredCommunityForMember(this.memberCommunity()??{churchId:this.requestedCommunityId}));}`});
    if(name==='openService'&&text.includes('this.selectedService.set')){
      openers++;const param=node.parameters[0].name.getText(ast);
      if(text.includes('duranki-service-status'))edits.push({start:node.getStart(ast),end:node.end,text:text.replace(`if(${param}.catalogueBlocked){`,`if(${param}.catalogueBlocked&&!(this.isServiceActive(${param})&&['Pricing required','Payment setup required'].includes(${param}.catalogueStatus))){`)});
      if(!text.includes('duranki-service-status'))edits.push({start:node.body.getStart(ast)+1,end:node.body.getStart(ast)+1,text:`if(${param}.catalogueBlocked){window.dispatchEvent(new CustomEvent('duranki-service-status',{detail:${param}}));return;}if(typeof this.dashboardAccessLimited==='function'&&this.dashboardAccessLimited()&&!['community-membership','community','wallet'].includes(${param}.code)){window.dispatchEvent(new CustomEvent('duranki-service-status',{detail:{...${param},catalogueStatus:'Community access required',catalogueDetail:'Activate your community membership before using this service.'}}));return;}if(${param}.catalogueRoute&&this.isServiceActive(${param})){const id=this.memberCommunity()?.churchId??this.requestedCommunityId;window.location.assign(${param}.catalogueRoute+(id?'?communityId='+encodeURIComponent(id):''));return;}`});
    }
  }
  ts.forEachChild(node,visit);
}
visit(ast);if(loaders!==1||gates!==1||openers!==1||lists!==1)throw Error('Unexpected member catalogue method counts; bundle unchanged.');
fs.mkdirSync('tmp',{recursive:true});if(!fs.existsSync('tmp/main-before-full-catalogue.js'))fs.copyFileSync(file,'tmp/main-before-full-catalogue.js');
let output=source;for(const edit of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,edit.start)+edit.text+output.slice(edit.end);
fs.writeFileSync(file,output);console.log('Reconciled every admin service with member cards and explicit readiness states.');

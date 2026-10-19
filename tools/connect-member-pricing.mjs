import fs from 'node:fs';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
import { canonicalService } from '../backend/src/service-pricing.js';
const file='frontend/dist/duranki-login/browser/main-4DAPJI7G.js';
const source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),edits=[];
const loader=`loadConfiguredServicePrices(){this.services=this.services.map(service=>({...service,plans:[],billingNote:'Pricing has not been configured.'}));const token=sessionStorage.getItem('duranki_access_token')||localStorage.getItem('duranki_access_token')||'';fetch('/api/service-pricing',{headers:{Authorization:'Bearer '+token},cache:'no-store'}).then(response=>{if(!response.ok)throw Error('Pricing unavailable');return response.json();}).then(data=>{this.services=this.services.map(service=>{const price=data.services.find(row=>row.code===(${canonicalService.toString()})(service.code));if(!price||price.mode==='unconfigured')return service;return {...service,billingNote:price.mode==='free'?'Free service access.':'Monthly service access fee. Product purchases and transaction charges are separate. Paid collection is not connected yet.',plans:[{code:price.mode==='free'?'configured-free':'configured-monthly',name:service.name+' access',price:price.mode==='free'?'Free':'R'+(price.amountCents/100).toFixed(2)+' / month',description:price.mode==='free'?'No monthly access fee.':'Monthly access subscription.'}]};});this.openRequestedService();}).catch(()=>{this.subscriptionError.set('Service pricing could not be loaded. Please refresh.');});}`;
let found=false;
function visit(node){
  if(ts.isMethodDeclaration(node)){
    const name=node.name.getText(ast),text=node.getText(ast);
    if(name==='ngOnInit'&&text.includes('loadTraderTraining')&&!text.includes('loadConfiguredServicePrices')){
      found=true;edits.push({start:node.getStart(ast),end:node.end,text:text.replace('ngOnInit(){','ngOnInit(){this.loadConfiguredServicePrices();')+loader});
    }
    if(name==='openService'&&text.includes('this.selectedService.set')){
      const prefix="if(!this.isServiceActive(n)&&!n.plans?.length){window.alert('This service price has not been configured yet. Please contact the platform administrator.');return;}";
      if(!text.includes('This service price has not been configured'))edits.push({start:node.getStart(ast),end:node.end,text:text.replace('if(n.code===\"build-up-balance\"',prefix+'if(n.code===\"build-up-balance\"')});
      else if(text.includes('if(!n.plans?.length)'))edits.push({start:node.getStart(ast),end:node.end,text:text.replace('if(!n.plans?.length)','if(!this.isServiceActive(n)&&!n.plans?.length)')});
    }
    if(name==='confirmSubscription'&&text.includes('Community membership payment is not connected')){
      const body=node.body.statements[0];
      edits.push({start:body.getStart(ast),end:body.end,text:`if(this.selectedService()?.code==='community-membership'&&this.user()?.communityMembershipAccess?.exempt===true){this.openService(this.selectedService());return;}`});
    }
    if(name==='confirmSubscription'&&text.includes('this.selectedService')&&!text.includes('Paid subscription collection is not connected')){
      edits.push({start:node.body.getStart(ast)+1,end:node.body.getStart(ast)+1,text:`if(this.selectedPlanCode?.()==='configured-monthly'&&!(this.selectedService()?.code==='community-membership'&&this.user()?.communityMembershipAccess?.exempt===true)){this.subscriptionError.set('Paid subscription collection is not connected yet. No payment or subscription has been recorded.');return;}`});
    }
    if(name==='payCommunityMembershipFromWallet'&&text.includes('this.subscriptionError'))edits.push({start:node.getStart(ast),end:node.end,text:'payCommunityMembershipFromWallet(){this.confirmSubscription()}'});
    if(name==='communityMembershipFeeCents')edits.push({start:node.getStart(ast),end:node.end,text:`communityMembershipFeeCents(){const plan=this.services.find(service=>service.code==='community-membership')?.plans[0];return plan?.code==='configured-monthly'?Math.round(Number(String(plan.price).match(/[0-9]+(?:\\.[0-9]+)?/)?.[0]||0)*100):0;}`});
    if(name==='servicePrice')edits.push({start:node.getStart(ast),end:node.end,text:'servicePrice(){return "Set in Service pricing"}'});
  }
  ts.forEachChild(node,visit);
}
visit(ast);if(!found&&!source.includes('loadConfiguredServicePrices'))throw Error('Member pricing entry not found.');
fs.mkdirSync('tmp',{recursive:true});if(!fs.existsSync('tmp/main-before-central-pricing.js'))fs.copyFileSync(file,'tmp/main-before-central-pricing.js');
let output=source;for(const e of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,e.start)+e.text+output.slice(e.end);fs.writeFileSync(file,output);
console.log('Member signup now loads central service access prices.');

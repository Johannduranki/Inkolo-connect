import fs from 'node:fs';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
const file='frontend/dist/duranki-login/browser/main-4DAPJI7G.js';
const source=fs.readFileSync(file,'utf8');
const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
let target;
function visit(node){if(ts.isMethodDeclaration(node)&&node.name.getText(ast)==='normalizeServices')target=node;ts.forEachChild(node,visit);}
visit(ast);if(!target)throw Error('Service catalogue method not found.');
let method=target.getText(ast);
if(!method.includes('Member referrals and referral tracking.')){
  const before='[...r.values()]';
  if(!method.includes(before))throw Error('Unexpected catalogue normalizer.');
  method=method.replace(before,`(()=>{for(const [code,name,category,description]of [['referral','Referral','Community','Member referrals and referral tracking.'],['keycha-properties','Properties','Property','Property listings and member enquiries.']]){if(!r.has(code))r.set(code,{code,name,category,description,price:0,currency:'ZAR',dashboardName:name+' Dashboard',dashboardRoute:'/dashboard/services/'+code,adminUsers:[]});}const ride=r.get('deliveries');if(ride){ride.name='Catch a Ride / Deliveries';ride.description='Ride matching and local delivery services.';}return [...r.values()];})()`);
}
fs.mkdirSync('tmp',{recursive:true});
if(!fs.existsSync('tmp/main-before-catalogue-repair.js'))fs.copyFileSync(file,'tmp/main-before-catalogue-repair.js');
fs.writeFileSync(file,source.slice(0,target.getStart(ast))+method+source.slice(target.end));
console.log('Restored missing catalogue entries without auto-enabling other tenant services.');

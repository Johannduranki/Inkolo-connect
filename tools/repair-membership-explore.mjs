import fs from 'node:fs';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
const file='frontend/dist/duranki-login/browser/main-4DAPJI7G.js';
const source=fs.readFileSync(file,'utf8');
const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
let target;
function visit(node){
  if(ts.isMethodDeclaration(node)&&node.name.getText(ast)==='availableServices'&&node.getText(ast).includes('communityScopedServices')){
    if(target)throw Error('Multiple catalogue methods found.');
    target=node;
  }
  ts.forEachChild(node,visit);
}
visit(ast);
if(!target)throw Error('Expected scoped service catalogue; bundle unchanged.');
const replacement="availableServices(){return this.communityScopedServices().filter(service=>!this.isServiceActive(service)&&!(service.code==='community-membership'&&this.user()?.communityMembershipAccess?.exempt===true))}";
fs.mkdirSync('tmp',{recursive:true});
if(!fs.existsSync('tmp/main-before-membership-explore.js'))fs.copyFileSync(file,'tmp/main-before-membership-explore.js');
fs.writeFileSync(file,source.slice(0,target.getStart(ast))+replacement+source.slice(target.end));
console.log('Exempt membership removed from Explore without creating a subscription.');

import fs from 'node:fs';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
const files=['frontend/src/app/features/platform-admin/platform-admin-dashboard/platform-admin-dashboard.component.ts','frontend/dist/duranki-login/browser/main-4DAPJI7G.js'];
for(const file of files){
  let source=fs.readFileSync(file,'utf8');
  const ast=ts.createSourceFile(file,source,99,true,file.endsWith('.ts')?ts.ScriptKind.TS:ts.ScriptKind.JS),edits=[];
  const prop=(node,key)=>node.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText(ast).replaceAll('"','').replaceAll("'",'')===key);
  function visit(node){
    if(ts.isObjectLiteralExpression(node)&&prop(node,'id')?.initializer.text==='tenant-inkolo'){
      const branding=prop(node,'branding')?.initializer;
      if(branding&&ts.isObjectLiteralExpression(branding)){
        const logo=prop(branding,'logoUrl')?.initializer;
        if(logo)edits.push({start:logo.getStart(ast),end:logo.end});
      }
    }
    ts.forEachChild(node,visit);
  }
  visit(ast);if(!edits.length)throw new Error('Inkolo default not found: '+file);
  fs.mkdirSync('tmp',{recursive:true});fs.copyFileSync(file,'tmp/inkolo-logo-before-'+file.split('/').at(-1));
  for(const edit of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+'"/inkolo-connect-logo.png"'+source.slice(edit.end);
  fs.writeFileSync(file,source);console.log(file+': '+edits.length+' logo default updated');
}

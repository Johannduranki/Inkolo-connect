import { readFileSync, writeFileSync, readdirSync, lstatSync, realpathSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { stagingBanner, stagingKind } from './staging-support.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=path.join(repo,'tmp/staging');
const {root}=JSON.parse(readFileSync(path.join(base,'latest.json'),'utf8'));
if(path.dirname(root)!==base||realpathSync(root)!==root)throw Error('Invalid staging root.');
const manifest=JSON.parse(readFileSync(path.join(root,'manifest.json'),'utf8'));
if(manifest.kind!==stagingKind||manifest.root!==root)throw Error('Not an isolated staging instance.');
const allowed=new Set(['.html','.css','.js','.json','.png','.jpg','.jpeg','.webp','.svg','.gif','.txt','.wasm','.woff','.woff2','.docx','.pdf']);
let copied=0;
function refresh(from,to){
  if(lstatSync(from).isSymbolicLink()||lstatSync(to).isSymbolicLink()||realpathSync(to)!==to)throw Error('Refusing linked frontend directories.');
  for(const item of readdirSync(from,{withFileTypes:true})){
    if(item.name.startsWith('.')||item.name.includes('.pre-migration-')||item.name==='node_modules')continue;
    const source=path.join(from,item.name),target=path.join(to,item.name);
    if(item.isSymbolicLink())throw Error('Refusing linked source assets.');
    if(item.isDirectory()){mkdirSync(target,{recursive:true});refresh(source,target);continue;}
    if(!allowed.has(path.extname(item.name).toLowerCase()))continue;
    try{if(lstatSync(target).isSymbolicLink())throw Error('Refusing linked output assets.');}catch(error){if(error.code!=='ENOENT')throw error;}
    if(item.name.endsWith('.html'))writeFileSync(target,stagingBanner(readFileSync(source,'utf8')));
    else copyFileSync(source,target);
    const relative=path.relative(root,target),record={path:relative,sha256:createHash('sha256').update(readFileSync(target)).digest('hex')};
    const index=manifest.files.findIndex(f=>f.path===relative);if(index<0)manifest.files.push(record);else manifest.files[index]=record;
    copied++;
  }
}
refresh(path.join(repo,'frontend/public'),path.join(root,'frontend/public'));
refresh(path.join(repo,'tmp/staging-build/browser'),path.join(root,'frontend/dist/duranki-login/browser'));
manifest.frontendRefreshedAt=new Date().toISOString();
writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({copied,root,testAccountsPreserved:true,liveAssetsChanged:false}));

import { createHash } from 'node:crypto';

export const SERVICE_ID='duranki-heritage';
export const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export const text=(v,max=160)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)fail(400,'A required text field is missing or too long.');return v.trim();};
export const normalize=s=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export const date=v=>{if(!v)return '';if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)fail(400,'Enter a valid date.');return v;};
export const now=()=>new Date().toISOString();
export const hash=s=>createHash('sha256').update(s).digest('hex');
// Paths use only records visible to the requester; no hidden names or connections leak.
export function relationshipPath(people,relationships,from,to){
  const ids=new Set(people.map(p=>p.person_id));if(!ids.has(from)||!ids.has(to))fail(404,'Person not available.');
  const adjacency=new Map([...ids].map(id=>[id,[]]));
  for(const r of relationships){if(!ids.has(r.from_person_id)||!ids.has(r.to_person_id))continue;adjacency.get(r.from_person_id).push({id:r.to_person_id,label:r.type==='parent'?'child':r.type});adjacency.get(r.to_person_id).push({id:r.from_person_id,label:r.type==='parent'?'parent':r.type});}
  const queue=[{id:from,path:[]}],seen=new Set([from]);
  for(let i=0;i<queue.length;i++){const current=queue[i];if(current.id===to){const labels=current.path.map(p=>p.label),key=labels.join('/');let label=({ '':'Self','parent':'Parent','child':'Child','spouse':'Spouse','sibling':'Sibling','parent/parent':'Grandparent','child/child':'Grandchild','parent/child':'Sibling','parent/parent/child':'Aunt / uncle','parent/child/child':'Niece / nephew','parent/parent/child/child':'First cousin','sibling/child':'Niece / nephew','parent/sibling':'Aunt / uncle','parent/sibling/child':'First cousin'})[key];if(!label&&labels.every(l=>l==='parent'))label=`Ancestor (${labels.length} generations)`;if(!label&&labels.every(l=>l==='child'))label=`Descendant (${labels.length} generations)`;return {label:label||'Extended family connection',path:current.path};}for(const edge of adjacency.get(current.id))if(!seen.has(edge.id)){seen.add(edge.id);queue.push({id:edge.id,path:[...current.path,edge]});}}
  return {label:'No visible relationship path',path:[]};
}

export { MysqlHeritageStore as HeritageStore } from './mysql-heritage-store.js';

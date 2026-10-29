import express from 'express';
import multer from 'multer';
import {createHash} from 'node:crypto';
import {platformAdmin} from './tenant-access.js';
import {imageType} from './branding.js';

const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export const emptyFuneralConfig=()=>({revision:0,name:'Funeral Cover',logoUrl:'',plans:[]});
export function saveFuneralConfig(state,actorId,body){
  const previous=state.funeralCoverConfig||emptyFuneralConfig();
  if(body?.revision!==previous.revision)fail('Configuration changed. Reload before saving.',409);
  const name=typeof body.name==='string'?body.name.trim():'';
  if(!name||name.length>100)fail('Enter a cover name of up to 100 characters.');
  const logoUrl=body.logoUrl??'';
  if(typeof logoUrl!=='string')fail('Upload a valid cover logo.');
  if(logoUrl&&(!/^\/api\/branding\/images\/[a-f0-9]{64}$/.test(logoUrl)||!state.brandingImages?.[logoUrl.split('/').at(-1)]))fail('Upload a valid cover logo.');
  if(!Array.isArray(body.plans)||body.plans.length>30)fail('Use up to 30 cover plans.');
  const ids=new Set();
  const plans=body.plans.map(p=>{
    if(!p||typeof p.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(p.id)||ids.has(p.id))fail('Each plan needs a unique identifier.');ids.add(p.id);
    const label=typeof p.name==='string'?p.name.trim():'';
    if(!label||label.length>100||!['single','family'].includes(p.type))fail('Enter a plan name and cover type.');
    if(!Number.isInteger(p.maxChildren)||p.maxChildren<0||p.maxChildren>20||(p.type==='single'&&p.maxChildren!==0))fail('Choose a valid child limit; individual plans have no children.');
    for(const field of ['costCents','sellingCents'])if(!Number.isSafeInteger(p[field])||p[field]<0||p[field]>100000000)fail('Enter valid non-negative monthly amounts with up to two decimals.');
    if(p.sellingCents<p.costCents)fail('Selling price cannot be below cost.');
    if(typeof p.includesSpouse!=='boolean'||typeof p.enabled!=='boolean'||(p.type==='single'&&p.includesSpouse))fail('Choose valid plan options.');
    return {id:p.id,name:label,type:p.type,maxChildren:p.maxChildren,includesSpouse:p.includesSpouse,costCents:p.costCents,sellingCents:p.sellingCents,markupCents:p.sellingCents-p.costCents,enabled:p.enabled};
  });
  const saved={revision:previous.revision+1,name,logoUrl,plans,updatedAt:new Date().toISOString()};
  (state.funeralCoverConfigAudit??=[]).push({actorId:String(actorId),at:saved.updatedAt,previous:structuredClone(previous)});
  state.funeralCoverConfig=saved;return saved;
}
export function createFuneralConfigRouter({requireAuth,resolveUser,readState,updateState}){
  const router=express.Router();router.use(requireAuth);
  router.use(async(req,res,next)=>{try{res.set('Cache-Control','no-store');const user=await resolveUser(req.auth.sub);if(user?.status!=='active'||!platformAdmin(user))return res.status(403).json({message:'Only Duranki platform administrators can configure funeral cover.'});next();}catch(e){next(e);}});
  router.get('/',(_req,res)=>res.json(readState().funeralCoverConfig||emptyFuneralConfig()));
  router.put('/',async(req,res,next)=>{try{res.json(await updateState(s=>saveFuneralConfig(s,req.auth.sub,req.body)));}catch(e){next(e);}});
  router.post('/logo',multer({storage:multer.memoryStorage(),limits:{fileSize:2*1024*1024,files:1,fields:0}}).single('logo'),async(req,res,next)=>{try{
    if(!req.file)fail('Choose a PNG or JPG logo.');
    let type;try{type=imageType(req.file.buffer);}catch(e){fail(e.message);}
    const hash=createHash('sha256').update(req.file.buffer).digest('hex');
    await updateState(s=>{s.brandingImages??={};s.brandingImages[hash]={type,data:req.file.buffer.toString('base64')};});
    res.json({logoUrl:'/api/branding/images/'+hash});
  }catch(e){next(e);}});
  router.use((e,_req,res,next)=>e.status||e.code==='LIMIT_FILE_SIZE'?res.status(e.status||413).json({message:e.code==='LIMIT_FILE_SIZE'?'Logo must be 2 MB or smaller.':e.message}):next(e));
  return router;
}

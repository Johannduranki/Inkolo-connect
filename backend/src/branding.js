import express from 'express';
import multer from 'multer';
import { createHash } from 'node:crypto';
import { platformAdmin, permissionsFor, tenantDirectory, communityPermissions } from './tenant-access.js';
import { legacyTraderTenantId } from './trader-community-hierarchy.js';

export function imageType(bytes){
  if(bytes.length<24)throw Error('Choose a PNG or JPG image.');
  if(bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))&&bytes.toString('ascii',12,16)==='IHDR'){
    const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);
    if(w>0&&h>0&&w<=4096&&h<=4096&&bytes.subarray(-8,-4).toString()==='IEND')return 'image/png';
  }
  if(bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217){
    let p=2;
    while(p+8<bytes.length){
      if(bytes[p++]!==255)break;
      while(bytes[p]===255)p++;
      const marker=bytes[p++];if(marker===218)break;
      if(p+2>bytes.length)break;
      const length=bytes.readUInt16BE(p);if(length<2||p+length>bytes.length)break;
      if([192,193,194].includes(marker)&&length>=8){const h=bytes.readUInt16BE(p+3),w=bytes.readUInt16BE(p+5);if(w>0&&h>0&&w<=4096&&h<=4096)return 'image/jpeg';break;}
      p+=length;
    }
  }
  throw Error('Use a valid PNG or JPG up to 4096 x 4096 pixels.');
}
export function brandingDirectory(state){
  const rows=[...tenantDirectory(state).map(t=>({kind:'tenant',id:t.id,name:t.name,tenantId:t.id})),...(state.importedCommunities||[]).map(c=>({kind:'community',id:c.platformCommunityId||c.id,aliases:[...new Set([c.id,...(c.aliases||[])])],name:c.name,tenantId:c.tenantId}))];
  for(const row of state.brandingDirectory||[])if(!rows.some(r=>r.kind===row.kind&&r.id===row.id))rows.push(row);
  return rows;
}
export function createBrandingRouter({requireAuth,resolveUser,readState,updateState}){
  const router=express.Router();
  // Logos are public branding assets, never executable uploads or private documents.
  router.get('/images/:hash',(req,res)=>{
    const file=readState().brandingImages?.[req.params.hash];if(!file)return res.sendStatus(404);
    res.set({'Content-Type':file.type,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Cache-Control':'public, max-age=31536000, immutable'}).send(Buffer.from(file.data,'base64'));
  });
  router.use(requireAuth);
  router.post('/directory',async(req,res,next)=>{try{
    const user=await resolveUser(req.auth.sub);if(!platformAdmin(user))return res.sendStatus(403);
    const {kind,id,name,tenantId}=req.body||{};
    if (kind === 'tenant' && id === legacyTraderTenantId) return res.status(409).json({ message: 'Trader Connect is a community of Inkolo Connect, not a tenant.' });
    if(!['tenant','community'].includes(kind)||typeof id!=='string'||!new RegExp('^'+kind+'-[a-z0-9-]{1,100}$').test(id)||typeof name!=='string'||!name.trim()||name.length>150)return res.status(400).json({message:'Invalid tenant or community.'});
    const row={kind,id,name:name.trim(),tenantId:kind==='tenant'?id:tenantId};
    const result=await updateState(current=>{
      const actor=current.users?.find(u=>String(u.id)===String(req.auth.sub));
      if(!platformAdmin(actor))throw Object.assign(Error('Platform Admin required.'),{status:403});
      const directory=brandingDirectory(current),existing=directory.find(r=>r.kind===kind&&r.id===id);
      if(existing)return {row:existing,created:false};
      if(kind==='community'&&!directory.some(r=>r.kind==='tenant'&&r.id===tenantId))throw Object.assign(Error('Register the parent tenant first.'),{status:400});
      (current.brandingDirectory??=[]).push(row);
      if(kind==='tenant')(current.tenantAccessDirectory??=[]).push({id,name:row.name});
      (current.brandingAudit??=[]).push({action:'register-owner',kind,id,tenantId:row.tenantId,actorId:String(user.id),at:new Date().toISOString()});
      return {row,created:true};
    });res.status(result.created?201:200).json(result.row);
  }catch(error){if(error.status)res.status(error.status).json({message:error.message});else next(error);}});
  const canEdit=(state,user,row)=>platformAdmin(user)||(row.kind==='community'?communityPermissions(state,user,row):permissionsFor(state,user,row.tenantId)).includes('branding.manage');
  router.get('/',async(req,res,next)=>{try{
    const user=await resolveUser(req.auth.sub);if(user?.status!=='active')return res.sendStatus(403);
    const state=readState();res.set('Cache-Control','no-store').json(brandingDirectory(state).map(row=>({...row,canEdit:canEdit(state,user,row),logoUrl:state.entityBranding?.[row.kind+':'+row.id]?.logoUrl||'',revision:state.entityBranding?.[row.kind+':'+row.id]?.revision||0})));
  }catch(error){next(error);}});
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:2*1024*1024,files:1,fields:1,parts:3}}).single('logo');
  router.put('/:kind/:id',async(req,res,next)=>{try{
    const user=await resolveUser(req.auth.sub),state=readState();
    const row=brandingDirectory(state).find(r=>r.kind===req.params.kind&&r.id===req.params.id);
    if(!row)return res.status(404).json({message:'Tenant or community not found.'});
    if(!canEdit(state,user,row))return res.status(403).json({message:'Branding permission is required for this tenant.'});
    upload(req,res,async error=>{try{
      if(error)return res.status(400).json({message:'Upload one PNG or JPG, maximum 2 MB.'});
      if(!req.file)return res.status(400).json({message:'Choose a logo image.'});
      let type;try{type=imageType(req.file.buffer);}catch(error){return res.status(400).json({message:error.message});}
      const revision=Number(req.body.revision);if(!Number.isSafeInteger(revision)||revision<0)return res.status(400).json({message:'Invalid logo revision.'});
      const hash=createHash('sha256').update(req.file.buffer).digest('hex'),key=row.kind+':'+row.id;let saved;
      await updateState(current=>{
        const actor=current.users?.find(u=>String(u.id)===String(req.auth.sub));
        const currentRow=brandingDirectory(current).find(r=>r.kind===row.kind&&r.id===row.id);
        if(!currentRow)throw Object.assign(Error('Tenant or community not found.'),{status:404});
        if(currentRow.tenantId!==row.tenantId)throw Object.assign(Error('Community tenant changed. Refresh before saving.'),{status:409});
        if(!canEdit(current,actor,currentRow))throw Object.assign(Error('Branding permission is required for this tenant.'),{status:403});
        if((current.entityBranding?.[key]?.revision||0)!==revision)throw Object.assign(Error('The logo changed. Refresh before saving.'),{status:409});
        (current.brandingImages??={})[hash]={type,data:req.file.buffer.toString('base64')};
        const previous=current.entityBranding?.[key]||null;
        saved={logoUrl:'/api/branding/images/'+hash,revision:revision+1};
        (current.entityBranding??={})[key]=saved;
        (current.brandingAudit??=[]).push({key,before:previous,after:saved,actorId:String(user.id),at:new Date().toISOString()});
      });
      res.json(saved);
    }catch(error){if(error.status)res.status(error.status).json({message:error.message});else next(error);}});
  }catch(error){next(error);}});
  return router;
}

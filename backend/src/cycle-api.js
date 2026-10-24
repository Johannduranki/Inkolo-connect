import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { CycleStore, cycleConfig, publicCycleConfig, signCyclePayload } from './cycle-pay.js';
import { billingTerms } from './cycle-billing.js';
import { joinableCommunities, findMembership } from './community-registration.js';
import { serviceCatalogue } from './service-pricing.js';
import { memberCapabilities } from '../../frontend/public/member-service-catalogue.js';
import { readPlatformState } from './platform-store.js';
import { fileURLToPath } from 'node:url';
import {platformAdmin} from './tenant-access.js';

export function createCycleRouter({requireAuth,resolveUser,store=new CycleStore(fileURLToPath(new URL('../data/cycle.sqlite',import.meta.url))),readState=readPlatformState,config=cycleConfig,billing,databaseAvailable=false}={}){
  const router=express.Router();
  router.post('/notifications',rateLimit({windowMs:60000,limit:300,standardHeaders:'draft-7',legacyHeaders:false}),async (req,res,next)=>{
    try{const result=await store.notify(req.body,req.get('x-callback-signature'),config());const event=JSON.parse(req.body.toString('utf8'));if(databaseAvailable&&await billing?.intent(event.id))return res.status(503).json({message:'Billing allocation requires the SQL storage adapter.'});await billing?.fulfil(event.id,event);res.json(result);}catch(error){next(error);}
  });
  router.use(requireAuth);
  router.use(async(req,res,next)=>{
    try{const user=await resolveUser(req.auth.sub);if(!user||user.status!=='active')return res.sendStatus(403);req.cycleAdmin=user.roles?.includes('Platform Admin')||user.roles?.includes('DURANKI_ADMIN');res.set('Cache-Control','no-store');next();}catch(error){next(error);}
  });
  const requests=async(userId,tenantId)=>{const result=[];for(const row of await store.list(userId,tenantId))result.push({...row,allocation:await billing?.fulfilled(row.id)?row.mode==='sandbox'?'Sandbox only':'Applied':row.status==='CHARGED'?'Allocation pending':'Awaiting payment'});return result;};
  router.get('/requests',async(req,res)=>res.json({requests:await requests(req.auth.sub),ready:config().ready}));
  router.get('/billing',async(req,res)=>{
    if(!billing||databaseAvailable)return res.status(503).json({message:'The payment storage adapter must be configured before database cutover.'});
    const state=readState(),settings=billing.settings(),cfg=config();
    res.json({ready:cfg.ready,mode:cfg.mode,recurringReady:settings.recurringReady,topUpsEnabled:settings.topUpsEnabled,termsVersion:billingTerms,
      communities:joinableCommunities(state).filter(c=>findMembership(state,req.auth.sub,c)).map(c=>({id:c.id,name:c.name,tenantName:c.tenantName,aliases:c.aliases,walletEnabled:billing.enabled(c,'wallet'),services:Object.entries(serviceCatalogue).filter(([code])=>billing.enabled(c,code)).map(([code,name])=>({code,name,mode:billing.price(code,c)?.mode||'unconfigured',amountCents:billing.price(code,c)?.amountCents,revision:billing.price(code,c)?.revision,issue:memberCapabilities[code]?.issue||''}))})),subscriptions:await billing.list(req.auth.sub)});
  });
  router.post('/billing',rateLimit({windowMs:60000,limit:10,standardHeaders:true,legacyHeaders:false}),async (req,res)=>{
    if(!billing||databaseAvailable)return res.status(503).json({message:'Payment storage is not configured.'});
    res.status(201).json(await billing.start(req.auth.sub,req.body||{}));
  });
  router.post('/subscriptions/:id/cancel',async(req,res)=>{
    if(!billing||databaseAvailable)return res.status(503).json({message:'Payment storage is not configured.'});
    res.json(await billing.cancel(req.auth.sub,req.params.id));
  });
  router.put('/availability',async (req,res)=>{
    if(!req.cycleAdmin)return res.sendStatus(403);
    if(!billing||databaseAvailable)return res.status(503).json({message:'Payment storage is not configured.'});
    const body=req.body||{},state=readState(),communities=joinableCommunities(state),tenantIds=new Set(communities.map(c=>c.tenantId));
    if(!Array.isArray(body.tenants)||!Array.isArray(body.communities)||body.tenants.length>200||body.communities.length>2000)return res.status(400).json({message:'Invalid service availability.'});
    const clean=(rows,kind)=>rows.map(r=>{
      if(typeof r.id!=='string'||!Array.isArray(r.serviceCodes)||r.serviceCodes.length>100||r.serviceCodes.some(c=>typeof c!=='string'||c.length>100))throw Object.assign(Error('Invalid availability record.'),{status:400});
      const community=communities.find(c=>c.id===r.id||c.aliases?.includes(r.id));
      if(kind==='community'&&(!community||community.tenantId!==r.tenantId))throw Object.assign(Error('Unknown community ownership.'),{status:400});
      return {id:community?.id||r.id,...(kind==='community'?{tenantId:r.tenantId}:{}),status:['active','configured'].includes(String(r.status).toLowerCase())?String(r.status).toLowerCase():'inactive',serviceCodes:[...new Set(r.serviceCodes)]};
    });
    const policy={tenants:clean(body.tenants.filter(t=>tenantIds.has(t.id)),'tenant'),communities:clean(body.communities,'community'),updatedAt:new Date().toISOString(),updatedBy:String(req.auth.sub)};
    await billing.updateState(state=>{
      if(!platformAdmin(state.users.find(u=>String(u.id)===String(req.auth.sub))))throw Object.assign(Error('Platform administrator access is required.'),{status:403});
      state.cycleServiceAvailability=policy;
      (state.securityAudit??=[]).push({action:'cycle.availability.changed',actorId:String(req.auth.sub),at:policy.updatedAt});
    });res.json({saved:true});
  });
  router.get('/admin',async(req,res)=>{
    if(!req.cycleAdmin)return res.sendStatus(403);
    const state=readState();
    const tenantId=req.query.tenantId;
    if(tenantId!==undefined&&(typeof tenantId!=='string'||!tenantId.trim()||tenantId.length>200))return res.status(400).json({message:'Choose a valid tenant.'});
    res.json({tenantId:tenantId||null,configuration:{...publicCycleConfig(config()),recurringReady:billing?.settings().recurringReady||false,topUpsEnabled:billing?.settings().topUpsEnabled||false},summary:await store.summary(tenantId),requests:await requests(null,tenantId),communities:(state.importedCommunities||[]).filter(c=>!tenantId||c.tenantId===tenantId).map(c=>({id:c.id,name:c.name,tenantId:c.tenantId,tenantName:c.tenantName}))});
  });
  router.post('/requests',rateLimit({windowMs:60000,limit:20,standardHeaders:'draft-7',legacyHeaders:false}),async(req,res,next)=>{
    if(!req.cycleAdmin)return res.sendStatus(403);
    try{
      const state=readState(),body=req.body||{};
      const member=state.users.find(u=>String(u.id)===body.userId&&u.status==='active');
      const community=(state.importedCommunities||[]).find(c=>c.id===body.communityId);
      const belongs=community&&(state.memberCommunities||[]).some(m=>String(m.memberId)===body.userId&&m.tenantId===community.tenantId&&[m.communityId,m.churchId].includes(community.id));
      if(!member||!community||!belongs)return res.status(400).json({message:'Choose an active member registered in this community.'});
      res.status(201).json(await store.create({...body,tenantId:community.tenantId},req.auth.sub,config().mode));
    }catch(error){next(error);}
  });
  router.post('/requests/:id/checkout',rateLimit({windowMs:60000,limit:10,standardHeaders:'draft-7',legacyHeaders:false}),async(req,res,next)=>{
    try{const result=await(billing?billing.checkout(req.params.id,req.auth.sub):store.checkout(req.params.id,req.auth.sub,config()));result.signature=signCyclePayload(result.payload,config().paywallKey);res.json(result);}catch(error){next(error);}
  });
  router.use((error,_req,res,_next)=>res.status(error.status||500).json({message:error.status?error.message:'Cycle payment processing is unavailable. No payment has been confirmed.'}));
  return router;
}

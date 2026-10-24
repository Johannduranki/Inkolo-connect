import express from 'express';
import { memberCapabilities } from '../../frontend/public/member-service-catalogue.js';
import { tenantDirectory, platformAdmin } from './tenant-access.js';
import { joinableCommunities } from './community-registration.js';
import { salesCommission, saveSalesCommission, salesCommissionQuote } from './sales-commission.js';
import { serviceScope, memberServiceScope, canConfigureServices, canReadServiceScope, ownServiceSetting, effectiveServicePrice, serviceEnabled, storeServiceSetting } from './service-scope.js';
export { effectiveServicePrice, serviceEnabled } from './service-scope.js';

export const serviceCatalogue = {
  marketplace:'Buy and Sell',jobs:'Job Search',wallet:'Wallet',payments:'Payments',
  airtime:'Airtime',utilities:'Utilities','vas-services':'VAS Services',
  'community-membership':'Community Membership',community:'My Community',
  'grant-distribution':'Grant Distribution','trader-training':'Trader Training',
  'vuma-fibre':'Vuma Force',internet:'Internet',insurance:'Insurance',education:'Education',
  'funeral-cover':'Funeral Cover',loans:'Loans',pos:'POS',deliveries:'Catch a Ride / Deliveries',
  'business-services':'Business Services',projects:'Projects',referral:'Referral',
  'keycha-properties':'Keycha Properties',kzncc:'KZNCC',heritage:'Heritage / Family Tree'
};
export function canonicalService(code){
  return ({'build-up-balance':'marketplace','job-search':'jobs',funeral:'funeral-cover',eduu:'education','catch-a-ride':'deliveries',transport:'deliveries','uif-trader-training':'trader-training',membership:'community-membership'})[code]||code;
}
export function marginAllocation(amountCents,costCents,shares){
  const marginCents=amountCents-costCents, distributable=Math.max(0,marginCents);
  const parties=['community','tenant','duranki'];
  const allocations=parties.map((party,index)=>({party,index,cents:Math.floor(distributable*shares[party]/10000),remainder:distributable*shares[party]%10000}));
  let remaining=distributable-allocations.reduce((sum,row)=>sum+row.cents,0);
  // Largest remainder conserves cents; ties follow community, tenant, Duranki order.
  for(const row of [...allocations].sort((a,b)=>b.remainder-a.remainder||a.index-b.index))if(remaining-->0)row.cents++;
  return {marginCents,allocations:Object.fromEntries(allocations.map(row=>[row.party,row.cents]))};
}
export function configuredSubscriptionPlan(state, serviceCode, planCode, context = {}){
  const code=canonicalService(serviceCode),price=effectiveServicePrice(state,code,context);
  if(context.id && !serviceEnabled(state,context,code)) return {error:403,message:'This service is not enabled for your community.'};
  if(!Object.hasOwn(serviceCatalogue,code))return {error:400,message:'Choose a valid service.'};
  if(memberCapabilities[code]?.issue)return {error:503,message:memberCapabilities[code].detail||'This member service is not implemented yet. No subscription or payment was recorded.'};
  if(!price) return {error:409,message:'This service price has not been configured by the platform administrator.'};
  const expected=price.mode==='free'?'configured-free':'configured-monthly';
  if(planCode!==expected&&!(price.mode==='free'&&planCode==='free'))return {error:400,message:'The service price changed. Refresh the page and review the current plan.'};
  if(price.mode==='paid')return {error:503,message:'Monthly price configured. Paid subscription collection is not connected yet. No payment or subscription was recorded.'};
  return {amountCents:0,label:serviceCatalogue[code]+' access',billingInterval:'monthly'};
}
export function createServicePricingRouter({requireAuth,resolveUser,readState,updateState,checkoutReady=()=>false}){
  const router=express.Router();router.use(requireAuth);
  router.get('/scopes',async(req,res,next)=>{try{
    const state=readState(),user=await resolveUser(req.auth.sub); if(user?.status!=='active')return res.sendStatus(403);
    const tenants=tenantDirectory(state).filter(t=>canConfigureServices(state,user,t.id));
    res.set('Cache-Control','no-store').json({platform:platformAdmin(user),tenants,communities:joinableCommunities(state).filter(c=>tenants.some(t=>t.id===c.tenantId)).map(c=>({id:c.id,name:c.name,tenantId:c.tenantId}))});
  }catch(error){next(error);}});
  router.get('/',async(req,res,next)=>{try{
    const user=await resolveUser(req.auth.sub);
    if(!user||user.status!=='active')return res.sendStatus(403);
    const state=readState();
    const scope=req.query.member==='true'?memberServiceScope(state,user.id,req.query.communityId):serviceScope(state,req.query); if(!canReadServiceScope(state,user,scope))return res.sendStatus(403);
    const canEdit=req.query.member!=='true'&&canConfigureServices(state,user,scope.tenantId);
    res.set('Cache-Control','no-store').json({canEdit,scope:{level:scope.level,tenantId:scope.tenantId,communityId:scope.communityId},services:Object.entries(serviceCatalogue).map(([code,name])=>{
      const price=effectiveServicePrice(state,code,scope),own=ownServiceSetting(state,code,scope);
      const visible={code,name,currency:'ZAR',billingInterval:'monthly',mode:price?.mode||'unconfigured',amountCents:price?.amountCents??null,revision:canEdit?own?.revision||0:price?.revision||0,effectiveRevision:price?.revision||0,priceSource:price?.source||'unconfigured',inheritPrice:scope.level!=='platform'&&(!own||own.inheritPrice===true),enabled:own?.enabled??null,effectiveEnabled:scope.community?serviceEnabled(state,scope.community,code):scope.tenantId?(state.servicePricing?.[code]?.enabled!==false&&(own?.enabled??!!state.cycleServiceAvailability?.tenants?.find(t=>t.id===scope.tenantId)?.serviceCodes?.some(s=>canonicalService(s)===code))):own?.enabled!==false,checkoutReady:checkoutReady(),readiness:memberCapabilities[code]?.issue||'Member screen available',readinessDetail:memberCapabilities[code]?.detail||''};
      const commission=salesCommission(state,code);
      if(commission)Object.assign(visible,{salesCommission:commission,canEditCommission:canEdit&&scope.level==='platform'&&platformAdmin(user)});
      return canEdit?{...visible,costCents:price?.costCents??null,shares:price?.shares??null}:visible;
    })});
  }catch(error){if(error.status)return res.status(error.status).json({message:error.message});next(error);}});
  router.put('/:code/commission',async(req,res,next)=>{try{
    const user=await resolveUser(req.auth.sub);
    if(!platformAdmin(user)||req.query.tenantId||req.query.communityId)return res.status(403).json({message:'Duranki sales commission is configured at platform level only.'});
    let saved;await updateState(state=>{saved=saveSalesCommission(state,user.id,req.params.code,req.body);});
    res.json(saved);
  }catch(error){if(error.status)return res.status(error.status).json({message:error.message});next(error);}});
  router.get('/:code/commission-quote',async(req,res,next)=>{try{
    const user=await resolveUser(req.auth.sub);if(user?.status!=='active')return res.sendStatus(403);
    if(typeof req.query.salePriceCents!=='string'||!/^\d{1,16}$/.test(req.query.salePriceCents))return res.status(400).json({message:'A valid sale price in cents is required.'});
    res.set('Cache-Control','no-store').json(salesCommissionQuote(readState(),req.params.code,Number(req.query.salePriceCents)));
  }catch(error){if(error.status)return res.status(error.status).json({message:error.message});next(error);}});
  router.put('/:code',async(req,res,next)=>{try{
    const user=await resolveUser(req.auth.sub);
    const scope=serviceScope(readState(),req.query);
    if(!user||user.status!=='active'||!canConfigureServices(readState(),user,scope.tenantId))return res.sendStatus(403);
    const code=req.params.code,{mode,amountCents,costCents,shares,revision}=req.body||{};
    if(!Object.hasOwn(serviceCatalogue,code))return res.status(404).json({message:'Unknown service.'});
    if(![undefined,null,true,false].includes(req.body?.enabled))return res.status(400).json({message:'Choose enabled, disabled or inherited availability.'});
    if(req.body?.inheritPrice===true&&scope.level!=='platform'){
      if(!Number.isSafeInteger(revision)||revision<0)return res.status(400).json({message:'Valid revision required.'});
      let saved;await updateState(state=>{saved=storeServiceSetting(state,user.id,code,scope,req.body,null);}); return res.json({code,...saved});
    }
    if(!['free','paid'].includes(mode)||!Number.isSafeInteger(amountCents)||amountCents<0||amountCents>100000000||(mode==='free'&&amountCents!==0)||(mode==='paid'&&amountCents===0)||!Number.isSafeInteger(revision)||revision<0)return res.status(400).json({message:'Choose Free or a positive monthly amount with at most two decimal places.'});
    const parties=['community','tenant','duranki'];
    if(!Number.isSafeInteger(costCents)||costCents<0||costCents>100000000)return res.status(400).json({message:'Enter a non-negative monthly cost with at most two decimal places.'});
    if(!shares||parties.some(p=>!Number.isSafeInteger(shares[p])||shares[p]<0||shares[p]>10000)||parties.reduce((sum,p)=>sum+shares[p],0)!==10000)return res.status(400).json({message:'Community, tenant and Duranki percentages must total 100% (up to two decimal places).'});
    let saved;
    await updateState(state=>{
      saved=storeServiceSetting(state,user.id,code,scope,req.body,{mode,amountCents,costCents,shares:Object.fromEntries(parties.map(p=>[p,shares[p]])),currency:'ZAR',billingInterval:'monthly'});
    });
    res.json({code,name:serviceCatalogue[code],...saved,preview:marginAllocation(amountCents,costCents,saved.shares)});
  }catch(error){if(error.status)return res.status(error.status).json({message:error.message});next(error);}});
  return router;
}

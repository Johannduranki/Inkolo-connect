import express from 'express';
import { memberCapabilities } from '../../frontend/public/member-service-catalogue.js';

export const serviceCatalogue = {
  marketplace:'Buy and Sell',jobs:'Job Search',wallet:'Wallet',payments:'Payments',
  airtime:'Airtime',utilities:'Utilities','vas-services':'VAS Services',
  'community-membership':'Community Membership',community:'My Community',
  'grant-distribution':'Grant Distribution','trader-training':'Trader Training',
  'vuma-fibre':'Vuma Force',internet:'Internet',insurance:'Insurance',education:'Education',
  'funeral-cover':'Funeral Cover',loans:'Loans',pos:'POS',deliveries:'Catch a Ride / Deliveries',
  'business-services':'Business Services',projects:'Projects',referral:'Referral',
  'keycha-properties':'Properties',kzncc:'KZNCC',heritage:'Heritage / Family Tree'
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
export function configuredSubscriptionPlan(state, serviceCode, planCode){
  const code=canonicalService(serviceCode),price=state.servicePricing?.[code];
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
  router.get('/',async(req,res,next)=>{try{
    const user=await resolveUser(req.auth.sub);
    if(!user||user.status!=='active')return res.sendStatus(403);
    const state=readState();
    const canEdit=(user.roles||[]).some(r=>['Platform Admin','DURANKI_ADMIN'].includes(r));
    res.set('Cache-Control','no-store').json({canEdit,services:Object.entries(serviceCatalogue).map(([code,name])=>{
      const price=state.servicePricing?.[code];
      const visible={code,name,currency:'ZAR',billingInterval:'monthly',mode:price?.mode||'unconfigured',amountCents:price?.amountCents??null,revision:price?.revision||0,checkoutReady:checkoutReady(),readiness:memberCapabilities[code]?.issue||'Member screen available',readinessDetail:memberCapabilities[code]?.detail||''};
      return canEdit?{...visible,costCents:price?.costCents??null,shares:price?.shares??null}:visible;
    })});
  }catch(error){next(error);}});
  router.put('/:code',async(req,res,next)=>{try{
    const user=await resolveUser(req.auth.sub);
    if(!user||user.status!=='active'||!(user.roles||[]).some(r=>['Platform Admin','DURANKI_ADMIN'].includes(r)))return res.sendStatus(403);
    const code=req.params.code,{mode,amountCents,costCents,shares,revision}=req.body||{};
    if(!Object.hasOwn(serviceCatalogue,code))return res.status(404).json({message:'Unknown service.'});
    if(!['free','paid'].includes(mode)||!Number.isSafeInteger(amountCents)||amountCents<0||amountCents>100000000||(mode==='free'&&amountCents!==0)||(mode==='paid'&&amountCents===0)||!Number.isSafeInteger(revision)||revision<0)return res.status(400).json({message:'Choose Free or a positive monthly amount with at most two decimal places.'});
    const parties=['community','tenant','duranki'];
    if(!Number.isSafeInteger(costCents)||costCents<0||costCents>100000000)return res.status(400).json({message:'Enter a non-negative monthly cost with at most two decimal places.'});
    if(!shares||parties.some(p=>!Number.isSafeInteger(shares[p])||shares[p]<0||shares[p]>10000)||parties.reduce((sum,p)=>sum+shares[p],0)!==10000)return res.status(400).json({message:'Community, tenant and Duranki percentages must total 100% (up to two decimal places).'});
    let saved;
    await updateState(state=>{
      state.servicePricing??={};const previous=state.servicePricing[code];
      if((previous?.revision||0)!==revision)throw Object.assign(Error('Price changed in another session. Refresh before saving.'),{status:409});
      saved={mode,amountCents,costCents,shares:Object.fromEntries(parties.map(p=>[p,shares[p]])),currency:'ZAR',billingInterval:'monthly',revision:revision+1,updatedAt:new Date().toISOString(),updatedBy:String(user.id)};
      state.servicePricing[code]=saved;
      state.servicePricingAudit??=[];
      state.servicePricingAudit.push({code,before:previous||null,after:saved});
    });
    res.json({code,name:serviceCatalogue[code],...saved,preview:marginAllocation(amountCents,costCents,saved.shares)});
  }catch(error){if(error.status)return res.status(error.status).json({message:error.message});next(error);}});
  return router;
}

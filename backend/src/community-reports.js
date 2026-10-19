import express from 'express';
import { brandingDirectory } from './branding.js';
import { platformAdmin, permissionsFor } from './tenant-access.js';

export function reportCommunities(state,user){
  return brandingDirectory(state).filter(c=>c.kind==='community' && (platformAdmin(user)||permissionsFor(state,user,c.tenantId).includes('reports.view')));
}
export function communityReport(state,community,charges,receipts,from,to){
  const ids=new Set([community.id,...(community.aliases||[])]);
  const scoped=r=>ids.has(r.communityId??r.community_id) && (r.tenantId??r.tenant_id)===community.tenantId;
  const inPeriod=value=>typeof value==='string'&&value.slice(0,10)>=from&&value.slice(0,10)<=to;
  const memberIds=new Set((state.memberCommunities||[]).filter(r=>scoped({...r,communityId:r.communityId||r.churchId})).map(r=>String(r.memberId)));
  const subscriptions=(state.serviceSubscriptions||[]).filter(s=>ids.has(s.communityId)&&(!s.tenantId||s.tenantId===community.tenantId));
  const payments=[...charges.filter(r=>scoped(r)&&r.mode==='live'&&inPeriod(r.status==='CHARGED'?r.charged_at:r.created_at)).map(r=>({userId:String(r.user_id),source:'Cycle Pay',status:r.review_required?'Review required':r.status,amountCents:r.amount_cents,currency:r.currency,reference:r.reference,date:r.charged_at||r.created_at})),
    ...receipts.filter(r=>scoped(r)&&inPeriod(r.received_on)).map(r=>({userId:String(r.user_id),source:'Treasury receipt',status:'Recorded receipt',amountCents:r.received_cents,currency:'ZAR',reference:r.reference,date:r.received_on}))];
  const totals=[];
  for(const p of payments){let total=totals.find(t=>t.source===p.source&&t.status===p.status&&t.currency===p.currency);if(!total){total={source:p.source,status:p.status,currency:p.currency,amountCents:0,count:0};totals.push(total);}total.amountCents+=p.amountCents;total.count++;}
  const members=(state.users||[]).filter(u=>memberIds.has(String(u.id))).map(u=>({id:String(u.id),name:[u.firstName||u.first_name,u.lastName||u.last_name].filter(Boolean).join(' ')||'Unnamed member',status:u.status,
    services:subscriptions.filter(s=>String(s.userId)===String(u.id)).map(s=>({name:s.serviceName||s.serviceCode,status:s.status||'Not recorded',reason:s.terminationReason||s.statusReason||null,amountCents:Number.isSafeInteger(s.amountCents)?s.amountCents:null,currency:s.currency||'ZAR',billingCycle:s.billingCycle||s.billingPeriod||(s.planCode==='monthly'?'monthly':'Not recorded')}))}));
  return {community,generatedAt:new Date().toISOString(),from,to,members,payments,totals,
    summary:{members:members.length,activeMembers:members.filter(m=>m.status==='active').length,activeServices:subscriptions.filter(s=>s.status==='active').length,
      terminatedForNonpayment:subscriptions.filter(s=>['terminated','cancelled','suspended'].includes(s.status)&&['non_payment','non-payment','nonpayment'].includes(s.terminationReason||s.statusReason)).length,
      unallocatedServices:(state.serviceSubscriptions||[]).filter(s=>memberIds.has(String(s.userId))&&!s.communityId).length},
    notes:['Membership and service status are current snapshots; dates filter payment records only.','Cycle charges and treasury receipts are separate sources and must not be added together without reconciliation. Sandbox payments are excluded.','Pending requests are not a complete arrears balance. Non-payment terminations are counted only where an explicit reason is recorded.','Subscriptions without a community are excluded from community service counts. No payment record does not mean that a member owes money.']};
}
export function createCommunityReportsRouter({requireAuth,resolveUser,readState,cycleStore,treasuryStore,databaseAvailable}){
  const router=express.Router();router.use(requireAuth);router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.get('/',async(req,res,next)=>{try{
    if(databaseAvailable)return res.status(503).json({message:'Community reports require the SQL reporting adapter before using this database mode.'});
    const user=await resolveUser(req.auth.sub);if(user?.status!=='active')return res.sendStatus(403);
    const state=readState(),communities=reportCommunities(state,user);
    if(!req.query.communityId)return res.json({communities});
    const community=communities.find(c=>[c.id,...(c.aliases||[])].includes(req.query.communityId));if(!community)return res.status(403).json({message:'You do not have reporting access to this community.'});
    const from=req.query.from||'2000-01-01',to=req.query.to||new Date().toISOString().slice(0,10);
    const valid=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
    if(!valid(from)||!valid(to)||from>to)return res.status(400).json({message:'Choose a valid date range.'});
    const charges=await cycleStore.tenantCharges(community.tenantId);
    const receipts=await treasuryStore.tenantReceipts(community.tenantId);
    // Financial reads can await storage while permissions or community ownership change.
    const current=readState(),actor=current.users.find(u=>String(u.id)===String(req.auth.sub));
    const currentCommunity=reportCommunities(current,actor).find(c=>c.id===community.id&&c.tenantId===community.tenantId);
    if(!currentCommunity)return res.status(403).json({message:'Reporting access changed. Refresh before requesting this report.'});
    return res.json(communityReport(current,currentCommunity,charges,receipts,from,to));
  }catch(error){next(error);}});return router;
}

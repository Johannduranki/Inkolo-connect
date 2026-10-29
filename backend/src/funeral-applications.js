import express from 'express';
import {randomUUID} from 'node:crypto';
import {memberServiceScope,serviceEnabled} from './service-scope.js';
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
export function funeralScope(state,userId,communityId){
 const scope=memberServiceScope(state,userId,communityId);
 if(!scope.community||!serviceEnabled(state,scope.community,'funeral-cover'))fail(403,'Funeral cover is not enabled for your community.');
 return scope;
}
export function funeralSummary(a){return {id:a.id,provider:'funeral',communityId:a.communityId,serviceCode:'funeral',planCode:a.plan.id,planLabel:a.plan.name,amountCents:a.amountCents,status:'pending',subscribedAt:a.createdAt};}
export function funeralSubscriptions(state,userId,communityId){return (state.funeralApplications||[]).filter(a=>a.userId===String(userId)&&a.communityId===communityId&&a.status==='submitted').map(funeralSummary);}
export function submitFuneral(state,userId,body){
 const scope=funeralScope(state,userId,body?.communityId),config=state.funeralCoverConfig;
 if(!config||body.revision!==config.revision)fail(409,'Plans have changed. Reload and review the current price.');
 const plan=config.plans.find(p=>p.id===body.planId&&p.enabled);
 if(!plan)fail(400,'Choose an available cover plan.');
 if((state.serviceSubscriptions||[]).some(s=>String(s.userId)===String(userId)&&s.serviceCode==='funeral'&&s.status==='active'&&(!s.communityId||s.communityId===scope.communityId)))fail(409,'Existing funeral cover is recorded. Contact your administrator before changing plans.');
 if((state.funeralApplications||[]).some(a=>a.userId===String(userId)&&a.communityId===scope.communityId&&a.status==='submitted'))fail(409,'You already have a funeral cover application in this community.');
 if(body.accepted!==true)fail(400,'Confirm the application details and monthly amount.');
 const person=(p,label)=>{
  const firstName=typeof p?.firstName==='string'?p.firstName.trim():'',lastName=typeof p?.lastName==='string'?p.lastName.trim():'';
  if(!firstName||!lastName||firstName.length>100||lastName.length>100)fail(400,'Enter valid names for '+label+'.');
  const dob=p?.dateOfBirth,date=new Date(dob+'T00:00:00Z');
  if(typeof dob!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(dob)||!Number.isFinite(+date)||date.toISOString().slice(0,10)!==dob||date>new Date()||date.getUTCFullYear()<1900)fail(400,'Enter a valid date of birth for '+label+'.');
  return {firstName,lastName,dateOfBirth:dob};
 };
 const member=person(body.member,'the member');
 if(!Array.isArray(body.children)||body.children.length>plan.maxChildren)fail(400,'The number of children exceeds this plan limit.');
 if(plan.type==='single'&&(body.spouse||body.children.length))fail(400,'Individual cover cannot include dependants.');
 if(body.spouse&&!plan.includesSpouse)fail(400,'This plan does not include a spouse.');
 const spouse=body.spouse?person(body.spouse,'the spouse'):null,children=body.children.map((p,i)=>person(p,'child '+(i+1)));
 const row={id:randomUUID(),userId:String(userId),tenantId:scope.tenantId,communityId:scope.communityId,coverName:config.name,logoUrl:config.logoUrl,configRevision:config.revision,plan:{id:plan.id,name:plan.name,type:plan.type,maxChildren:plan.maxChildren,includesSpouse:plan.includesSpouse},amountCents:plan.sellingCents,member,spouse,children,status:'submitted',paymentStatus:'unpaid',coverStatus:'pending_provider_confirmation',createdAt:new Date().toISOString(),accepted:true};
 (state.funeralApplications??=[]).push(row);return row;
}
export function createFuneralApplicationRouter({requireAuth,resolveUser,readState,updateState}){
 const router=express.Router();router.use(requireAuth);router.use(async(req,res,next)=>{try{res.set('Cache-Control','no-store');if((await resolveUser(req.auth.sub))?.status!=='active')return res.sendStatus(403);next();}catch(e){next(e);}});
 router.get('/',(req,res,next)=>{try{
  const state=readState(),scope=funeralScope(state,req.auth.sub,req.query.communityId),config=state.funeralCoverConfig;
  res.json({communityId:scope.communityId,revision:config?.revision||0,name:config?.name||'Funeral Cover',logoUrl:config?.logoUrl||'',plans:(config?.plans||[]).filter(p=>p.enabled).map(p=>({id:p.id,name:p.name,type:p.type,maxChildren:p.maxChildren,includesSpouse:p.includesSpouse,amountCents:p.sellingCents})),application:(state.funeralApplications||[]).find(a=>a.userId===String(req.auth.sub)&&a.communityId===scope.communityId&&a.status==='submitted')||null});
 }catch(e){next(e);}});
 router.post('/',async(req,res,next)=>{try{res.status(201).json(await updateState(s=>submitFuneral(s,req.auth.sub,req.body)));}catch(e){next(e);}});
 router.post('/cancel',async(req,res,next)=>{try{await updateState(s=>{const a=(s.funeralApplications||[]).find(a=>a.id===req.body?.id&&a.userId===String(req.auth.sub)&&a.status==='submitted');if(!a)fail(404,'Application not found.');a.status='cancelled';a.cancelledAt=new Date().toISOString();});res.json({cancelled:true});}catch(e){next(e);}});
 router.use((e,req,res,next)=>e.status?res.status(e.status).json({message:e.message}):next(e));return router;
}

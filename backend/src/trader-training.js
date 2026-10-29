import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { brandingDirectory } from './branding.js';
import { platformAdmin } from './tenant-access.js';
import { starterLessons } from './trader-curriculum.js';
import { inkoloTenantId, traderCommunityId } from './trader-community-hierarchy.js';

const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
export const traderTenant='tenant-trader-connect';
export const trainingCommunities=state=>brandingDirectory(state).filter(c=>c.kind==='community'&&(c.tenantId===traderTenant||(c.tenantId===inkoloTenantId&&c.id===traderCommunityId)));
export function trainingMember(state,userId,community){return (state.memberCommunities||[]).some(m=>String(m.memberId)===String(userId)&&m.tenantId===community.tenantId&&(!m.status||['active','approved'].includes(String(m.status).toLowerCase()))&&[community.id,...(community.aliases||[])].includes(m.communityId||m.churchId));}
const titles=['Know your business and money','Pricing, profit and stock','Cash flow and record keeping','Customers and daily operations','Business growth and planning'];
export const draftModules=()=>titles.map((title,i)=>({id:'module-'+(i+1),title,content:starterLessons[i].content,amountCents:null,questions:starterLessons[i].questions.map((q,j)=>({id:'q'+(j+1),...structuredClone(q)}))}));
export function validateModules(modules,publish){
  if(!Array.isArray(modules)||modules.length!==5)fail(400,'The programme must contain exactly five modules.');
  return modules.map((m,i)=>{
    if(!m||typeof m!=='object')fail(400,'Enter valid module details.');
    if(typeof m.title!=='string'||!m.title.trim()||m.title.length>150||typeof m.content!=='string'||m.content.length>30000)fail(400,'Enter a title and lesson text for each module.');
    if(m.amountCents!==null&&(!Number.isSafeInteger(m.amountCents)||m.amountCents<1||m.amountCents>100000000))fail(400,'Module funding must be positive whole cents, up to R1,000,000.');
    if(!Array.isArray(m.questions)||m.questions.length>30)fail(400,'Each module supports up to 30 questions.');
    const questions=m.questions.map((q,j)=>{
      if(!q||typeof q!=='object')fail(400,'Enter valid question details.');
      if(typeof q.prompt!=='string'||!q.prompt.trim()||q.prompt.length>2000||!Array.isArray(q.options)||q.options.length<2||q.options.length>6||q.options.some(o=>typeof o!=='string'||!o.trim()||o.length>500)||new Set(q.options.map(o=>o.trim())).size!==q.options.length||!Number.isInteger(q.correctIndex)||q.correctIndex<0||q.correctIndex>=q.options.length)fail(400,'Each question needs distinct answer choices and one correct answer.');
      return {id:'q'+(j+1),prompt:q.prompt.trim(),options:q.options.map(o=>o.trim()),correctIndex:q.correctIndex};
    });
    if(publish&&(!m.content.trim()||!questions.length||m.amountCents===null))fail(400,'Before publishing, complete all five lessons, quizzes and funding amounts.');
    return {id:'module-'+(i+1),title:m.title.trim(),content:m.content.trim(),amountCents:m.amountCents,questions};
  });
}
export { MysqlTrainingStore as TrainingStore } from './mysql-training-store.js';
export function trainingMemberView(p,grants){return {id:p.id,name:p.name,communityId:p.community_id,state:p.state,currency:'ZAR',requiredPassPercentage:100,totalAmountCents:p.modules.reduce((sum,m)=>sum+(m.amountCents||0),0),unlockedAmountCents:grants.reduce((sum,g)=>sum+g.amount_cents,0),completedModules:grants.length,grants,modules:p.modules.map((m,i)=>{const completed=grants.some(g=>g.module_id===m.id),available=p.state==='PUBLISHED'&&(i===0||grants.some(g=>g.module_id===p.modules[i-1].id));return {id:m.id,title:m.title,amountCents:m.amountCents,status:completed?'COMPLETED':available?'AVAILABLE':'LOCKED',content:available||completed?m.content:'',questions:available&&!completed?m.questions.map(({correctIndex,...q})=>q):[]};})};}
export function createTrainingRouter({requireAuth,resolveUser,readState,store}){
  if (!store) throw Error('A MariaDB training store is required.');
  const router=express.Router();router.use(requireAuth);router.use(async(req,res,next)=>{try{res.set('Cache-Control','no-store');const user=await resolveUser(req.auth.sub);if(user?.status!=='active')return res.sendStatus(403);req.trainingUser=user;next();}catch(e){next(e);}});
  const admin=(req,res,next)=>platformAdmin(req.trainingUser)?next():res.status(403).json({message:'Only Duranki Platform Admin may configure lessons and grant funding.'});
  router.get('/access',async(req,res)=>{
    const state=readState(),isAdmin=platformAdmin(req.trainingUser),programmes=[];
    for(const p of await store.list()){
      const c=trainingCommunities(state).find(c=>[c.id,...(c.aliases||[])].includes(p.community_id));
      if(c&&trainingMember(state,req.auth.sub,c)&&p.state==='PUBLISHED')programmes.push(await store.memberView(p,req.auth.sub));
    }
    res.json({admin:isAdmin,tenant:{id:inkoloTenantId,name:'Inkolo Connect'},communities:trainingCommunities(state).filter(c=>isAdmin||trainingMember(state,req.auth.sub,c)),programmes});
  });
  router.get('/admin',admin,async(_req,res)=>{const programmes=await store.list(),grants=[];for(const p of programmes)for(const g of await store.grants(p.id))grants.push({...g,communityId:p.community_id});res.json({programmes,grants});});
  router.post('/programmes',admin,async(req,res)=>{const c=trainingCommunities(readState()).find(c=>c.id===req.body?.communityId);if(!c)fail(400,'Choose a Trader Connect community.');res.status(201).json(await store.create(c,req.auth.sub));});
  router.put('/programmes/:id',admin,async(req,res)=>res.json(await store.save(req.params.id,req.body||{},req.auth.sub)));
  router.post('/programmes/:id/modules/:moduleId/attempts',rateLimit({windowMs:60000,limit:15,standardHeaders:true,legacyHeaders:false}),async(req,res)=>{const p=await store.get(req.params.id),c=trainingCommunities(readState()).find(c=>[c.id,...(c.aliases||[])].includes(p?.community_id));if(!c||!trainingMember(readState(),req.auth.sub,c))fail(403,'You must belong to this Trader Connect community.');res.json(await store.attempt(p.id,req.auth.sub,req.params.moduleId,req.body.answers));});
  router.use((error,_req,res,next)=>error.status?res.status(error.status).json({message:error.message}):next(error));return router;
}

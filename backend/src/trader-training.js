import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { brandingDirectory } from './branding.js';
import { platformAdmin } from './tenant-access.js';
import { starterLessons } from './trader-curriculum.js';

const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
export const traderTenant='tenant-trader-connect';
export const trainingCommunities=state=>brandingDirectory(state).filter(c=>c.kind==='community'&&c.tenantId===traderTenant);
export function trainingMember(state,userId,community){return (state.memberCommunities||[]).some(m=>String(m.memberId)===String(userId)&&m.tenantId===traderTenant&&[community.id,...(community.aliases||[])].includes(m.communityId||m.churchId));}
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
export class TrainingStore {
  constructor(filename){this.db=new DatabaseSync(filename);this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS programme(id TEXT PRIMARY KEY,community_id TEXT NOT NULL UNIQUE,name TEXT NOT NULL,state TEXT NOT NULL,revision INTEGER NOT NULL,modules TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS attempt(id TEXT PRIMARY KEY,programme_id TEXT NOT NULL,user_id TEXT NOT NULL,module_id TEXT NOT NULL,score INTEGER NOT NULL,passed INTEGER NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS entitlement(id TEXT PRIMARY KEY,programme_id TEXT NOT NULL,user_id TEXT NOT NULL,module_id TEXT NOT NULL,amount_cents INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'ELIGIBLE',created_at TEXT NOT NULL,UNIQUE(programme_id,user_id,module_id));
    CREATE TABLE IF NOT EXISTS training_audit(id INTEGER PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,record_id TEXT NOT NULL,created_at TEXT NOT NULL);`);}
  get(id){const row=this.db.prepare('SELECT * FROM programme WHERE id=?').get(id);return row?{...row,modules:JSON.parse(row.modules)}:null;}
  list(){return this.db.prepare('SELECT id FROM programme ORDER BY created_at').all().map(r=>this.get(r.id));}
  audit(actor,action,id){this.db.prepare('INSERT INTO training_audit(actor,action,record_id,created_at) VALUES(?,?,?,?)').run(String(actor),action,id,new Date().toISOString());}
  tx(work){this.db.exec('BEGIN IMMEDIATE');try{const result=work();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  create(community,actor){return this.tx(()=>{if(this.db.prepare('SELECT id FROM programme WHERE community_id=?').get(community.id))fail(409,'This community already has a programme.');const id=randomUUID();this.db.prepare('INSERT INTO programme VALUES(?,?,?,?,?,?,?)').run(id,community.id,community.name+' trader development','DRAFT',1,JSON.stringify(draftModules()),new Date().toISOString());this.audit(actor,'PROGRAMME_CREATED',id);return this.get(id);});}
  save(id,input,actor){return this.tx(()=>{const p=this.get(id);if(!p)fail(404,'Programme not found.');if(p.state!=='DRAFT')fail(409,'Published lessons and funding are locked to protect member progress and grant records.');if(input.revision!==p.revision)fail(409,'Programme changed. Refresh before saving.');if(typeof input.name!=='string'||!input.name.trim()||input.name.length>150||typeof input.publish!=='boolean')fail(400,'Enter a programme name and publication choice.');const modules=validateModules(input.modules,input.publish);this.db.prepare('UPDATE programme SET name=?,state=?,revision=revision+1,modules=? WHERE id=?').run(input.name.trim(),input.publish?'PUBLISHED':'DRAFT',JSON.stringify(modules),id);this.audit(actor,input.publish?'PROGRAMME_PUBLISHED':'DRAFT_SAVED',id);return this.get(id);});}
  grants(id,userId){return this.db.prepare('SELECT * FROM entitlement WHERE programme_id=?'+(userId?' AND user_id=?':'')+' ORDER BY created_at').all(...(userId?[id,String(userId)]:[id]));}
  memberView(p,userId){return trainingMemberView(p,this.grants(p.id,userId));}
  attempt(id,userId,moduleId,answers){return this.tx(()=>{const p=this.get(id);if(!p||p.state!=='PUBLISHED')fail(409,'This programme is not published.');const index=p.modules.findIndex(m=>m.id===moduleId);if(index<0)fail(404,'Module not found.');const grants=this.grants(id,userId);if(grants.some(g=>g.module_id===moduleId))return {alreadyCompleted:true,passed:true,dashboard:this.memberView(p,userId)};if(index>0&&!grants.some(g=>g.module_id===p.modules[index-1].id))fail(409,'Complete the previous module with 100% first.');const m=p.modules[index];if(!answers||typeof answers!=='object'||Array.isArray(answers)||Object.keys(answers).length!==m.questions.length||m.questions.some(q=>!Number.isInteger(answers[q.id])||answers[q.id]<0||answers[q.id]>=q.options.length))fail(400,'Answer every question.');const correct=m.questions.filter(q=>answers[q.id]===q.correctIndex).length,passed=correct===m.questions.length,score=Math.floor(correct/m.questions.length*100),now=new Date().toISOString();this.db.prepare('INSERT INTO attempt VALUES(?,?,?,?,?,?,?)').run(randomUUID(),id,String(userId),moduleId,score,passed?1:0,now);if(passed)this.db.prepare('INSERT INTO entitlement(id,programme_id,user_id,module_id,amount_cents,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),id,String(userId),moduleId,m.amountCents,now);this.audit(userId,passed?'MODULE_PASSED_GRANT_ELIGIBLE':'MODULE_RETRY',id+':'+moduleId);return {score,passed,dashboard:this.memberView(p,userId)};});}
}
export function trainingMemberView(p,grants){return {id:p.id,name:p.name,communityId:p.community_id,state:p.state,currency:'ZAR',requiredPassPercentage:100,totalAmountCents:p.modules.reduce((sum,m)=>sum+(m.amountCents||0),0),unlockedAmountCents:grants.reduce((sum,g)=>sum+g.amount_cents,0),completedModules:grants.length,grants,modules:p.modules.map((m,i)=>{const completed=grants.some(g=>g.module_id===m.id),available=p.state==='PUBLISHED'&&(i===0||grants.some(g=>g.module_id===p.modules[i-1].id));return {id:m.id,title:m.title,amountCents:m.amountCents,status:completed?'COMPLETED':available?'AVAILABLE':'LOCKED',content:available||completed?m.content:'',questions:available&&!completed?m.questions.map(({correctIndex,...q})=>q):[]};})};}
export function createTrainingRouter({requireAuth,resolveUser,readState,store,databaseAvailable}){
  const router=express.Router();router.use(requireAuth);router.use(async(req,res,next)=>{try{res.set('Cache-Control','no-store');if(databaseAvailable)return res.status(503).json({message:'Training SQL identity adapter must be configured before database cutover.'});const user=await resolveUser(req.auth.sub);if(user?.status!=='active')return res.sendStatus(403);req.trainingUser=user;next();}catch(e){next(e);}});
  const admin=(req,res,next)=>platformAdmin(req.trainingUser)?next():res.status(403).json({message:'Only Duranki Platform Admin may configure lessons and grant funding.'});
  router.get('/access',async(req,res)=>{
    const state=readState(),isAdmin=platformAdmin(req.trainingUser),programmes=[];
    for(const p of await store.list()){
      const c=trainingCommunities(state).find(c=>c.id===p.community_id);
      if(c&&trainingMember(state,req.auth.sub,c)&&p.state==='PUBLISHED')programmes.push(await store.memberView(p,req.auth.sub));
    }
    res.json({admin:isAdmin,tenant:{id:traderTenant,name:'Trader Connect'},communities:trainingCommunities(state).filter(c=>isAdmin||trainingMember(state,req.auth.sub,c)),programmes});
  });
  router.get('/admin',admin,async(_req,res)=>{const programmes=await store.list(),grants=[];for(const p of programmes)for(const g of await store.grants(p.id))grants.push({...g,communityId:p.community_id});res.json({programmes,grants});});
  router.post('/programmes',admin,async(req,res)=>{const c=trainingCommunities(readState()).find(c=>c.id===req.body?.communityId);if(!c)fail(400,'Choose a Trader Connect community.');res.status(201).json(await store.create(c,req.auth.sub));});
  router.put('/programmes/:id',admin,async(req,res)=>res.json(await store.save(req.params.id,req.body||{},req.auth.sub)));
  router.post('/programmes/:id/modules/:moduleId/attempts',rateLimit({windowMs:60000,limit:15,standardHeaders:true,legacyHeaders:false}),async(req,res)=>{const p=await store.get(req.params.id),c=trainingCommunities(readState()).find(c=>c.id===p?.community_id);if(!c||!trainingMember(readState(),req.auth.sub,c))fail(403,'You must belong to this Trader Connect community.');res.json(await store.attempt(p.id,req.auth.sub,req.params.moduleId,req.body.answers));});
  router.use((error,_req,res,next)=>error.status?res.status(error.status).json({message:error.message}):next(error));return router;
}

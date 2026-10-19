import express from 'express';
import multer from 'multer';
import {randomUUID} from 'node:crypto';
import {fail,relationshipPath} from './heritage-store.js';

export function heritageScopes(state){
  const scopes=new Map();
  for(const c of state.importedCommunities||[])if(c.tenantId)scopes.set(c.id,{tenant_id:c.tenantId,community_id:c.id,name:c.name});
  for(const c of state.churches||[])if(c.tenantId)scopes.set(c.id,{tenant_id:c.tenantId,community_id:c.id,name:c.name});
  for(const m of state.memberCommunities||[])if(m.tenantId){const id=m.communityId||m.churchId;scopes.set(id,{tenant_id:m.tenantId,community_id:id,name:m.communityName||m.churchName});}
  return [...scopes.values()];
}
export function createHeritageRouter({requireAuth,readState,resolveUser,store,databaseAvailable=false}){
  const router=express.Router();
  router.get('/public/:id',(req,res)=>{
    if(databaseAvailable)return res.status(503).json({message:'Heritage storage adapter is not configured.'});
    const p=store.get("SELECT p.* FROM person p JOIN community_service c ON c.community_id=p.community_id JOIN tenant_service t ON t.tenant_id=p.tenant_id WHERE p.person_id=? AND p.privacy='Public' AND c.enabled=1 AND t.enabled=1",req.params.id);
    if(!p)return res.status(404).json({message:'Public profile not available.'});
    res.set('Cache-Control','no-store').json({person_id:p.person_id,display_name:p.display_name,birth_year:p.birth_date.slice(0,4),death_year:p.death_date.slice(0,4),verification:p.verification});
  });
  router.use(requireAuth);
  router.use(async(req,res,next)=>{try{
    res.set('Cache-Control','no-store');
    if(databaseAvailable)fail(503,'Heritage membership adapter for MySQL must be configured before use.');
    const user=await resolveUser(req.auth.sub);if(!user||user.status!=='active')fail(403,'Active account required.');
    const state=readState(),all=heritageScopes(state),roles=user.roles||[],id=String(user.id);
    req.actor={id,name:`${user.first_name||user.firstName||''} ${user.last_name||user.lastName||''}`.trim(),platform:roles.includes('Platform Admin'),admin:roles.some(r=>['Tenant Admin','Community Admin','TENANT_ADMIN','COMMUNITY_ADMIN'].includes(r)),scopes:all.filter(s=>(state.memberCommunities||[]).some(m=>String(m.memberId)===id&&(m.communityId||m.churchId)===s.community_id&&m.tenantId===s.tenant_id))};
    // Explicit grants extend verifier access only to their assigned community, never a global role alone.
    if(req.actor.admin)for(const s of all)if(store.get('SELECT 1 FROM verifier WHERE user_id=? AND tenant_id=? AND community_id=?',id,s.tenant_id,s.community_id)&&!req.actor.scopes.some(x=>x.community_id===s.community_id))req.actor.scopes.push(s);
    req.allScopes=all;next();
  }catch(e){next(e);}});
  router.get('/access',(req,res)=>res.json({service:{service_id:'duranki-heritage',name:'Duranki Heritage / Family Tree',dashboard:'/dashboard/heritage',amountCents:0,currency:'ZAR'},userId:req.actor.id,platform:req.actor.platform,subscriptions:store.subscriptions(req.actor.id),invitations:store.invitations(req.actor),scopes:(req.actor.platform?req.allScopes:req.actor.scopes).map(s=>({...s,...(store.get('SELECT c.enabled,t.enabled AS tenant_enabled FROM community_service c JOIN tenant_service t USING(tenant_id) WHERE c.community_id=?',s.community_id)||{enabled:0,tenant_enabled:0})}))}));
  router.post('/enrol',(req,res)=>res.json(store.tx(()=>store.enrol(req.actor,String(req.body.community_id||'')))));
  router.post('/invitations/:id/accept',(req,res)=>res.json(store.acceptInvitation(req.actor,req.params.id)));
  router.post('/invitations/:id/decline',(req,res)=>{const inv=store.get('SELECT * FROM invitation WHERE invitation_id=? AND target_user_id=? AND used_at IS NULL',req.params.id,req.actor.id);if(!inv)fail(404,'Invitation not available.');store.run('UPDATE invitation SET used_at=? WHERE invitation_id=?',new Date().toISOString(),inv.invitation_id);store.audit(req.actor,'CLAIM_DECLINED',inv.person_id);res.json({ok:true});});
  router.put('/configuration',(req,res)=>res.json(store.configure(req.actor,req.allScopes,req.body)));
  router.put('/verifiers',async(req,res)=>{
    if(!req.actor.platform)fail(403,'Platform administrator required.');
    const s=req.allScopes.find(s=>s.community_id===req.body.community_id);if(!s)fail(400,'Choose an existing community.');
    if(!store.get('SELECT 1 FROM community_service WHERE community_id=?',s.community_id))fail(400,'Configure the service first.');
    const target=await resolveUser(String(req.body.user_id));if(!target||target.status!=='active'||!target.roles?.some(r=>['Tenant Admin','Community Admin','TENANT_ADMIN','COMMUNITY_ADMIN'].includes(r)))fail(400,'Choose an existing tenant or community administrator.');
    if(typeof req.body.enabled!=='boolean')fail(400,'Choose verifier availability.');
    if(req.body.enabled)store.run('INSERT OR IGNORE INTO verifier VALUES(?,?,?)',String(target.id),s.tenant_id,s.community_id);else store.run('DELETE FROM verifier WHERE user_id=? AND tenant_id=? AND community_id=?',String(target.id),s.tenant_id,s.community_id);
    store.audit(req.actor,'VERIFIER_CONFIGURED',String(target.id));res.json({ok:true});
  });
  router.get('/tree',(req,res)=>res.json(store.snapshot(req.actor,String(req.query.community_id||''))));
  router.post('/trees',(req,res)=>res.status(201).json(store.createTree(req.actor,req.body)));
  router.post('/duplicates',(req,res)=>res.json(store.duplicates(req.actor,req.body)));
  router.post('/people',(req,res)=>res.status(201).json(store.tx(()=>store.createPerson(req.actor,req.body))));
  router.put('/people/:id',(req,res)=>res.json(store.updatePerson(req.actor,req.params.id,req.body)));
  router.post('/relationships',(req,res)=>res.status(201).json(store.addRelationship(req.actor,req.body)));
  router.delete('/relationships/:id',(req,res)=>{const r=store.get('SELECT * FROM relationship WHERE relationship_id=?',req.params.id);if(!r)fail(404,'Relationship not available.');store.person(req.actor,r.from_person_id,true);store.person(req.actor,r.to_person_id,true);store.tx(()=>{store.run('DELETE FROM relationship WHERE relationship_id=?',r.relationship_id);store.run("UPDATE person SET verification='Unverified',version=version+1 WHERE person_id IN (?,?)",r.from_person_id,r.to_person_id);store.audit(req.actor,'RELATIONSHIP_REMOVED',r.relationship_id);});res.json({ok:true});});
  router.get('/path',(req,res)=>{const from=store.person(req.actor,String(req.query.from)),to=store.person(req.actor,String(req.query.to));if(from.tree_id!==to.tree_id)fail(400,'Choose people in the same tree.');const s=store.snapshot(req.actor,from.community_id);res.json(relationshipPath(s.people,s.relationships,from.person_id,to.person_id));});
  router.post('/people/:id/invitations',(req,res)=>{
    const p=store.person(req.actor,req.params.id,true),phone=String(req.body.telephoneNumber||'').replace(/\D/g,'');
    const normalized=phone.startsWith('27')&&phone.length===11?'0'+phone.slice(2):phone;
    const state=readState(),targets=state.users.filter(u=>u.telephoneNumber===normalized&&u.status==='active');
    if(targets.length!==1||!(state.memberCommunities||[]).some(m=>String(m.memberId)===String(targets[0].id)&&m.tenantId===p.tenant_id&&(m.communityId||m.churchId)===p.community_id))fail(400,'The recipient must have an active account in this community.');
    res.status(201).json(store.invite(req.actor,p.person_id,String(targets[0].id)));
  });
  router.post('/claim',(req,res)=>res.json(store.claim(req.actor,req.body.token)));
  router.post('/people/:id/verification',(req,res)=>res.json(store.verify(req.actor,req.params.id,req.body)));
  router.get('/people/:id/verification',(req,res)=>{store.person(req.actor,req.params.id);res.json(store.all('SELECT status,evidence,created_at FROM verification_history WHERE person_id=? ORDER BY created_at DESC',req.params.id));});
  router.post('/leadership',(req,res)=>res.status(201).json(store.tx(()=>store.royal(req.actor,req.body))));
  router.post('/succession',(req,res)=>res.status(201).json(store.tx(()=>store.succeed(req.actor,req.body))));
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1}});
  router.post('/people/:id/documents',(req,res,next)=>{try{store.person(req.actor,req.params.id,true);next();}catch(e){next(e);}},upload.single('document'),(req,res)=>{
    const f=req.file;if(!f)fail(400,'Choose a PDF, PNG or JPEG document.');const bytes=f.buffer;
    const mime=bytes.subarray(0,5).toString()==='%PDF-'?'application/pdf':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':null;
    if(!mime)fail(400,'Only PDF, PNG and JPEG documents are accepted.');const id=randomUUID();store.run('INSERT INTO document VALUES(?,?,?,?,?,?,?)',id,req.params.id,f.originalname.replace(/[^\w. -]/g,'_').slice(0,120),mime,bytes,req.actor.id,new Date().toISOString());store.audit(req.actor,'DOCUMENT_UPLOADED',id);res.status(201).json({document_id:id});
  });
  router.get('/documents/:id',(req,res)=>{const d=store.get('SELECT * FROM document WHERE document_id=?',req.params.id);if(!d)fail(404,'Document not available.');store.person(req.actor,d.person_id);res.set('Content-Disposition','attachment; filename="'+d.filename+'"');res.type(d.mime).send(Buffer.from(d.content));});
  router.use((error,req,res,next)=>{if(error.code?.startsWith('SQLITE_CONSTRAINT')||error.message?.includes('UNIQUE constraint'))return res.status(409).json({message:'This record already exists or conflicts with the selected family tree.'});if(error.code==='LIMIT_FILE_SIZE')return res.status(400).json({message:'Documents must be 5 MB or smaller.'});if(error.status)return res.status(error.status).json({message:error.message});next(error);});
  return router;
}

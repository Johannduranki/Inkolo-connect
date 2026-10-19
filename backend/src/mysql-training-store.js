import {randomUUID} from 'node:crypto';
import {draftModules,validateModules,trainingMemberView} from './trader-training.js';
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
export class MysqlTrainingStore {
  constructor(pool){this.pool=pool;}
  async ready(){const [[row]]=await this.pool.query('SELECT id FROM duranki_training_migration WHERE id=1');if(!row)throw Error('Training migration must be verified first.');}
  async tx(work){const c=await this.pool.getConnection();try{await c.beginTransaction();const result=await work(c);await c.commit();return result;}catch(error){await c.rollback().catch(()=>{});throw error;}finally{c.release();}}
  async get(id,c=this.pool,lock=false){const [[row]]=await c.execute('SELECT * FROM duranki_training_programme WHERE id=?'+(lock?' FOR UPDATE':''),[id]);return row?{...row,modules:JSON.parse(row.modules)}:null;}
  async list(){const [rows]=await this.pool.query('SELECT * FROM duranki_training_programme ORDER BY created_at');return rows.map(row=>({...row,modules:JSON.parse(row.modules)}));}
  async audit(actor,action,id,c){await c.execute('INSERT INTO duranki_training_audit(actor,action,record_id,created_at) VALUES(?,?,?,?)',[String(actor),action,id,new Date().toISOString()]);}
  async create(community,actor){
    try{return await this.tx(async c=>{
      const id=randomUUID();await c.execute('INSERT INTO duranki_training_programme(id,community_id,name,state,revision,modules,created_at) VALUES(?,?,?,?,?,?,?)',[id,community.id,community.name+' trader development','DRAFT',1,JSON.stringify(draftModules()),new Date().toISOString()]);
      await this.audit(actor,'PROGRAMME_CREATED',id,c);return this.get(id,c);
    });}catch(error){if(error.code==='ER_DUP_ENTRY')fail(409,'This community already has a programme.');throw error;}
  }
  save(id,input,actor){return this.tx(async c=>{
    const p=await this.get(id,c,true);
    if(!p)fail(404,'Programme not found.');
    if(p.state!=='DRAFT')fail(409,'Published lessons and funding are locked to protect member progress and grant records.');
    if(input.revision!==p.revision)fail(409,'Programme changed. Refresh before saving.');
    if(typeof input.name!=='string'||!input.name.trim()||input.name.length>150||typeof input.publish!=='boolean')fail(400,'Enter a programme name and publication choice.');
    const modules=validateModules(input.modules,input.publish);
    await c.execute('UPDATE duranki_training_programme SET name=?,state=?,revision=revision+1,modules=? WHERE id=?',[input.name.trim(),input.publish?'PUBLISHED':'DRAFT',JSON.stringify(modules),id]);
    await this.audit(actor,input.publish?'PROGRAMME_PUBLISHED':'DRAFT_SAVED',id,c);return this.get(id,c);
  });}
  async grants(id,userId,c=this.pool){const [rows]=await c.execute('SELECT * FROM duranki_training_entitlement WHERE programme_id=?'+(userId?' AND user_id=?':'')+' ORDER BY created_at',userId?[id,String(userId)]:[id]);return rows;}
  async memberView(p,userId,c=this.pool){return trainingMemberView(p,await this.grants(p.id,userId,c));}
  attempt(id,userId,moduleId,answers){return this.tx(async c=>{
    const p=await this.get(id,c,true);
    if(!p||p.state!=='PUBLISHED')fail(409,'This programme is not published.');
    const index=p.modules.findIndex(m=>m.id===moduleId);if(index<0)fail(404,'Module not found.');
    const grants=await this.grants(id,userId,c);
    if(grants.some(g=>g.module_id===moduleId))return {alreadyCompleted:true,passed:true,dashboard:await this.memberView(p,userId,c)};
    if(index>0&&!grants.some(g=>g.module_id===p.modules[index-1].id))fail(409,'Complete the previous module with 100% first.');
    const m=p.modules[index];
    if(!answers||typeof answers!=='object'||Array.isArray(answers)||Object.keys(answers).length!==m.questions.length||m.questions.some(q=>!Number.isInteger(answers[q.id])||answers[q.id]<0||answers[q.id]>=q.options.length))fail(400,'Answer every question.');
    const correct=m.questions.filter(q=>answers[q.id]===q.correctIndex).length,passed=correct===m.questions.length,score=Math.floor(correct/m.questions.length*100),now=new Date().toISOString();
    await c.execute('INSERT INTO duranki_training_attempt(id,programme_id,user_id,module_id,score,passed,created_at) VALUES(?,?,?,?,?,?,?)',[randomUUID(),id,String(userId),moduleId,score,passed?1:0,now]);
    if(passed)await c.execute('INSERT INTO duranki_training_entitlement(id,programme_id,user_id,module_id,amount_cents,created_at) VALUES(?,?,?,?,?,?)',[randomUUID(),id,String(userId),moduleId,m.amountCents,now]);
    await this.audit(userId,passed?'MODULE_PASSED_GRANT_ELIGIBLE':'MODULE_RETRY',id+':'+moduleId,c);
    return {score,passed,dashboard:await this.memberView(p,userId,c)};
  });}
}

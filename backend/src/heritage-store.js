import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, createHash } from 'node:crypto';

export const SERVICE_ID='duranki-heritage';
export const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export const text=(v,max=160)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)fail(400,'A required text field is missing or too long.');return v.trim();};
export const normalize=s=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export const date=v=>{if(!v)return '';if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)fail(400,'Enter a valid date.');return v;};
export const now=()=>new Date().toISOString();
export const hash=s=>createHash('sha256').update(s).digest('hex');
export class HeritageStore{
  constructor(filename){
    this.db=new DatabaseSync(filename);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS catalogue(service_id TEXT PRIMARY KEY,name TEXT NOT NULL);
      INSERT OR IGNORE INTO catalogue VALUES('duranki-heritage','Duranki Heritage / Family Tree');
      CREATE TABLE IF NOT EXISTS tenant_service(tenant_id TEXT PRIMARY KEY,service_id TEXT NOT NULL REFERENCES catalogue(service_id),enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)));
      CREATE TABLE IF NOT EXISTS community_service(community_id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenant_service(tenant_id),name TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),UNIQUE(tenant_id,community_id));
      CREATE TABLE IF NOT EXISTS verifier(user_id TEXT NOT NULL,tenant_id TEXT NOT NULL,community_id TEXT NOT NULL,PRIMARY KEY(user_id,tenant_id,community_id),FOREIGN KEY(tenant_id,community_id) REFERENCES community_service(tenant_id,community_id));
      CREATE TABLE IF NOT EXISTS tree(tree_id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,community_id TEXT NOT NULL,owner_user_id TEXT NOT NULL,name TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(tree_id,tenant_id,community_id),FOREIGN KEY(tenant_id,community_id) REFERENCES community_service(tenant_id,community_id));
      CREATE TABLE IF NOT EXISTS person(person_id TEXT PRIMARY KEY,tree_id TEXT NOT NULL,tenant_id TEXT NOT NULL,community_id TEXT NOT NULL,owner_user_id TEXT NOT NULL,claimed_user_id TEXT,display_name TEXT NOT NULL,name_key TEXT NOT NULL,birth_date TEXT NOT NULL DEFAULT '',death_date TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',privacy TEXT NOT NULL DEFAULT 'Private' CHECK(privacy IN('Private','Family','Community','Public')),verification TEXT NOT NULL DEFAULT 'Unverified' CHECK(verification IN('Unverified','Family Confirmed','Community Verified','Officially Verified')),version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,UNIQUE(person_id,tree_id),UNIQUE(tree_id,claimed_user_id),FOREIGN KEY(tree_id,tenant_id,community_id) REFERENCES tree(tree_id,tenant_id,community_id));
      CREATE TABLE IF NOT EXISTS relationship(relationship_id TEXT PRIMARY KEY,tree_id TEXT NOT NULL,from_person_id TEXT NOT NULL,to_person_id TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN('parent','spouse','sibling')),kind TEXT NOT NULL CHECK(kind IN('biological','adoptive','step','unspecified')),created_by TEXT NOT NULL,CHECK(from_person_id<>to_person_id),UNIQUE(tree_id,from_person_id,to_person_id,type),FOREIGN KEY(from_person_id,tree_id) REFERENCES person(person_id,tree_id),FOREIGN KEY(to_person_id,tree_id) REFERENCES person(person_id,tree_id));
      CREATE TABLE IF NOT EXISTS invitation(invitation_id TEXT PRIMARY KEY,person_id TEXT NOT NULL REFERENCES person(person_id),target_user_id TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,expires_at TEXT NOT NULL,used_at TEXT,created_by TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS leadership(leadership_id TEXT PRIMARY KEY,person_id TEXT NOT NULL,tree_id TEXT NOT NULL,title TEXT NOT NULL,royal_house TEXT NOT NULL,clan TEXT NOT NULL,reign_from TEXT NOT NULL,reign_to TEXT NOT NULL,notes TEXT NOT NULL,FOREIGN KEY(person_id,tree_id) REFERENCES person(person_id,tree_id));
      CREATE TABLE IF NOT EXISTS succession(succession_id TEXT PRIMARY KEY,tree_id TEXT NOT NULL,predecessor_id TEXT NOT NULL,successor_id TEXT NOT NULL,office TEXT NOT NULL,effective_on TEXT NOT NULL,notes TEXT NOT NULL,CHECK(predecessor_id<>successor_id),UNIQUE(tree_id,predecessor_id,successor_id,office),FOREIGN KEY(predecessor_id,tree_id) REFERENCES person(person_id,tree_id),FOREIGN KEY(successor_id,tree_id) REFERENCES person(person_id,tree_id));
      CREATE TABLE IF NOT EXISTS document(document_id TEXT PRIMARY KEY,person_id TEXT NOT NULL REFERENCES person(person_id),filename TEXT NOT NULL,mime TEXT NOT NULL,content BLOB NOT NULL,uploaded_by TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS verification_history(id TEXT PRIMARY KEY,person_id TEXT NOT NULL REFERENCES person(person_id),status TEXT NOT NULL,evidence TEXT NOT NULL,actor_user_id TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,record_id TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS duplicate_review(person_id TEXT PRIMARY KEY REFERENCES person(person_id),reason TEXT NOT NULL,actor TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS enrolment(user_id TEXT NOT NULL,tenant_id TEXT NOT NULL,community_id TEXT NOT NULL,service_id TEXT NOT NULL REFERENCES catalogue(service_id),status TEXT NOT NULL CHECK(status IN('active','cancelled')),created_at TEXT NOT NULL,PRIMARY KEY(user_id,community_id),FOREIGN KEY(tenant_id,community_id) REFERENCES community_service(tenant_id,community_id));
      CREATE INDEX IF NOT EXISTS person_scope ON person(tenant_id,community_id);
      CREATE INDEX IF NOT EXISTS duplicate_person ON person(tenant_id,community_id,name_key,birth_date);
    `);
  }
  all(sql,...args){return this.db.prepare(sql).all(...args);}
  get(sql,...args){return this.db.prepare(sql).get(...args);}
  run(sql,...args){return this.db.prepare(sql).run(...args);}
  tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  audit(actor,action,id){this.run('INSERT INTO audit(actor,action,record_id,created_at) VALUES(?,?,?,?)',actor.id,action,id,now());}
  enrol(actor,community){
    const scope=this.scope(actor,community);
    if(this.get("SELECT 1 FROM enrolment WHERE user_id=? AND community_id=? AND status='active'",actor.id,community))return {ok:true};
    this.run("INSERT INTO enrolment VALUES(?,?,?,?,'active',?) ON CONFLICT(user_id,community_id) DO UPDATE SET status='active'",actor.id,scope.tenant_id,scope.community_id,SERVICE_ID,now());
    this.audit(actor,'SERVICE_JOINED',community);return {ok:true};
  }
  subscriptions(userId){
    return this.all('SELECT e.*,c.name,c.enabled,t.enabled AS tenant_enabled FROM enrolment e JOIN community_service c USING(community_id) JOIN tenant_service t ON t.tenant_id=e.tenant_id WHERE e.user_id=?',String(userId)).map(e=>({userId:String(userId),tenantId:e.tenant_id,communityId:e.community_id,communityName:e.name,serviceCode:SERVICE_ID,serviceName:'Duranki Heritage / Family Tree',planCode:'free',planLabel:'Heritage - '+e.name,amountCents:0,currency:'ZAR',billingCycle:'monthly',status:e.status==='active'&&(!e.enabled||!e.tenant_enabled)?'suspended':e.status,subscribedAt:e.created_at,dashboardRoute:'/dashboard/heritage?communityId='+encodeURIComponent(e.community_id)}));
  }
  invitations(actor){
    return this.all('SELECT i.invitation_id,i.person_id,i.expires_at,p.display_name,p.community_id,p.tenant_id FROM invitation i JOIN person p USING(person_id) JOIN community_service c ON c.community_id=p.community_id JOIN tenant_service t ON t.tenant_id=p.tenant_id WHERE i.target_user_id=? AND i.used_at IS NULL AND i.expires_at>? AND c.enabled=1 AND t.enabled=1',actor.id,now()).filter(i=>this.inScope(actor,i.tenant_id,i.community_id)).map(({tenant_id,...i})=>i);
  }
  acceptInvitation(actor,id){
    return this.tx(()=>{
      const inv=this.get('SELECT * FROM invitation WHERE invitation_id=? AND target_user_id=? AND used_at IS NULL AND expires_at>?',id,actor.id,now());if(!inv)fail(404,'Invitation is invalid or expired.');
      const p=this.get('SELECT * FROM person WHERE person_id=?',inv.person_id);this.scope(actor,p.community_id);if(p.claimed_user_id)fail(409,'Already claimed.');
      this.run("UPDATE person SET claimed_user_id=?,owner_user_id=?,privacy='Private',verification='Unverified',version=version+1 WHERE person_id=?",actor.id,actor.id,p.person_id);
      this.run('UPDATE invitation SET used_at=? WHERE invitation_id=?',now(),id);this.enrol(actor,p.community_id);this.audit(actor,'PERSON_CLAIMED',p.person_id);return {person_id:p.person_id};
    });
  }
  inScope(actor,tenant,community){return actor.platform||actor.scopes.some(s=>s.tenant_id===tenant&&s.community_id===community);}
  scope(actor,community){const s=this.get('SELECT c.*,t.enabled AS tenant_enabled FROM community_service c JOIN tenant_service t USING(tenant_id) WHERE c.community_id=?',community);if(!s||!this.inScope(actor,s.tenant_id,s.community_id))fail(404,'Community not available.');if(!s.enabled||!s.tenant_enabled)fail(403,'Heritage is not enabled for this tenant and community.');return s;}
  family(actor,tree){return !!this.get('SELECT person_id FROM person WHERE tree_id=? AND claimed_user_id=?',tree,actor.id);}
  canRead(actor,p){return this.inScope(actor,p.tenant_id,p.community_id)&&(p.owner_user_id===actor.id||p.claimed_user_id===actor.id||['Community','Public'].includes(p.privacy)||(p.privacy==='Family'&&this.family(actor,p.tree_id)));}
  person(actor,id,edit=false){const p=this.get('SELECT * FROM person WHERE person_id=?',id);if(!p)fail(404,'Person not available.');this.scope(actor,p.community_id);if(!this.canRead(actor,p))fail(404,'Person not available.');if(edit&&(p.claimed_user_id||p.owner_user_id)!==actor.id)fail(403,'Only the profile manager can edit this person.');return p;}
  configure(actor,scopes,body){
    if(!actor.platform)fail(403,'Platform administrator required.');
    const scope=scopes.find(s=>s.community_id===body.community_id&&s.tenant_id===body.tenant_id);if(!scope)fail(400,'Choose an existing tenant/community.');
    if(typeof body.tenant_enabled!=='boolean'||typeof body.enabled!=='boolean')fail(400,'Choose service availability.');
    return this.tx(()=>{this.run('INSERT INTO tenant_service VALUES(?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET enabled=excluded.enabled',scope.tenant_id,SERVICE_ID,+body.tenant_enabled);this.run('INSERT INTO community_service VALUES(?,?,?,?) ON CONFLICT(community_id) DO UPDATE SET enabled=excluded.enabled,name=excluded.name',scope.community_id,scope.tenant_id,scope.name,+body.enabled);this.audit(actor,'SERVICE_CONFIGURED',scope.community_id);return {ok:true};});
  }
  snapshot(actor,community){
    const scope=this.scope(actor,community),people=this.all('SELECT * FROM person WHERE tenant_id=? AND community_id=?',scope.tenant_id,community).filter(p=>this.canRead(actor,p));
    const ids=new Set(people.map(p=>p.person_id)),trees=this.all('SELECT * FROM tree WHERE tenant_id=? AND community_id=?',scope.tenant_id,community).filter(t=>t.owner_user_id===actor.id||people.some(p=>p.tree_id===t.tree_id));
    return {people:people.map(p=>({...p,canEdit:(p.claimed_user_id||p.owner_user_id)===actor.id})),trees,
      relationships:this.all('SELECT r.* FROM relationship r JOIN tree t USING(tree_id) WHERE t.community_id=?',community).filter(r=>ids.has(r.from_person_id)&&ids.has(r.to_person_id)),
      leadership:this.all('SELECT l.* FROM leadership l JOIN tree t USING(tree_id) WHERE t.community_id=?',community).filter(l=>ids.has(l.person_id)),
      succession:this.all('SELECT s.* FROM succession s JOIN tree t USING(tree_id) WHERE t.community_id=?',community).filter(s=>ids.has(s.predecessor_id)&&ids.has(s.successor_id)),
      documents:this.all('SELECT d.document_id,d.person_id,d.filename,d.created_at FROM document d JOIN person p USING(person_id) WHERE p.community_id=?',community).filter(d=>ids.has(d.person_id)),
      canVerify:actor.platform||this.isVerifier(actor,scope),userId:actor.id,platform:actor.platform};
  }
  isVerifier(actor,p){return actor.admin&&!!this.get('SELECT 1 FROM verifier WHERE user_id=? AND tenant_id=? AND community_id=?',actor.id,p.tenant_id,p.community_id);}
  createTree(actor,body){const s=this.scope(actor,body.community_id);return this.tx(()=>{const id=randomUUID();this.run('INSERT INTO tree VALUES(?,?,?,?,?,?)',id,s.tenant_id,s.community_id,actor.id,text(body.name),now());const person=this.createPerson(actor,{tree_id:id,display_name:actor.name,privacy:'Private'},true);this.enrol(actor,s.community_id);this.audit(actor,'TREE_CREATED',id);return {tree_id:id,person_id:person.person_id};});}
  duplicates(actor,body){const s=this.scope(actor,body.community_id);return this.all('SELECT * FROM person WHERE tenant_id=? AND community_id=? AND name_key=?',s.tenant_id,s.community_id,normalize(text(body.display_name))).filter(p=>this.canRead(actor,p)).map(p=>({person_id:p.person_id,tree_id:p.tree_id,display_name:p.display_name,birth_date:p.birth_date}));}
  createPerson(actor,b,self=false){
    const tree=this.get('SELECT * FROM tree WHERE tree_id=?',b.tree_id);if(!tree)fail(404,'Tree not available.');this.scope(actor,tree.community_id);
    if(tree.owner_user_id!==actor.id&&!this.family(actor,tree.tree_id))fail(403,'Join this family tree before adding people.');
    const name=text(b.display_name),birth=date(b.birth_date),death=date(b.death_date);if(birth&&death&&death<birth)fail(400,'Death cannot precede birth.');
    if(!['Private','Family','Community','Public'].includes(b.privacy||'Private'))fail(400,'Choose a privacy level.');
    if(b.privacy==='Public'&&!self&&!death)fail(400,'Living relatives must claim their profile before making it Public.');
    const matches=this.all('SELECT * FROM person WHERE tenant_id=? AND community_id=? AND name_key=? AND birth_date=?',tree.tenant_id,tree.community_id,normalize(name),birth);
    if(matches.length&&!self&&!b.duplicate_reason)fail(409,'A matching person already exists. Review duplicates or supply a reason for a distinct person.');
    if(b.duplicate_reason)text(b.duplicate_reason,500);
    const id=randomUUID();this.run('INSERT INTO person(person_id,tree_id,tenant_id,community_id,owner_user_id,claimed_user_id,display_name,name_key,birth_date,death_date,notes,privacy,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',id,tree.tree_id,tree.tenant_id,tree.community_id,actor.id,self?actor.id:null,name,normalize(name),birth,death,b.notes?text(b.notes,2000):'',b.privacy||'Private',now());
    if(b.duplicate_reason)this.run('INSERT INTO duplicate_review VALUES(?,?,?)',id,b.duplicate_reason.trim(),actor.id);
    this.audit(actor,b.duplicate_reason?'PERSON_CREATED_DUPLICATE_REVIEWED':'PERSON_CREATED',id);return {person_id:id};
  }
  updatePerson(actor,id,b){
    const p=this.person(actor,id,true);if(b.version!==p.version)fail(409,'This person changed. Reload before saving.');
    const name=text(b.display_name),birth=date(b.birth_date),death=date(b.death_date);
    if(birth&&death&&death<birth)fail(400,'Death cannot precede birth.');
    if(!['Private','Family','Community','Public'].includes(b.privacy))fail(400,'Choose a privacy level.');
    if(b.privacy==='Public'&&p.claimed_user_id!==actor.id&&!death)fail(400,'Living relatives must claim their profile before making it Public.');
    return this.tx(()=>{this.run("UPDATE person SET display_name=?,name_key=?,birth_date=?,death_date=?,notes=?,privacy=?,verification='Unverified',version=version+1 WHERE person_id=?",name,normalize(name),birth,death,b.notes?text(b.notes,2000):'',b.privacy,id);this.audit(actor,'PERSON_UPDATED_VERIFICATION_RESET',id);return {ok:true};});
  }
  addRelationship(actor,b){
    const from=this.person(actor,b.from_person_id,true),to=this.person(actor,b.to_person_id,true);if(from.tree_id!==to.tree_id||from.person_id===to.person_id)fail(400,'Choose two different people in the same tree.');
    if(!['parent','spouse','sibling'].includes(b.type)||!['biological','adoptive','step','unspecified'].includes(b.kind))fail(400,'Choose a relationship type.');
    let a=from.person_id,c=to.person_id;if(b.type!=='parent'&&a>c)[a,c]=[c,a];
    if(b.type==='parent'){
      const edges=this.all("SELECT from_person_id,to_person_id FROM relationship WHERE tree_id=? AND type='parent'",from.tree_id),seen=new Set([c]),queue=[c];
      for(let i=0;i<queue.length;i++)for(const e of edges)if(e.from_person_id===queue[i]&&!seen.has(e.to_person_id)){seen.add(e.to_person_id);queue.push(e.to_person_id);}if(seen.has(a))fail(409,'This would create an ancestry cycle.');
    }
    return this.tx(()=>{const id=randomUUID();this.run('INSERT INTO relationship VALUES(?,?,?,?,?,?,?)',id,from.tree_id,a,c,b.type,b.kind,actor.id);this.run("UPDATE person SET verification='Unverified',version=version+1 WHERE person_id IN (?,?)",a,c);this.audit(actor,'RELATIONSHIP_CREATED',id);return {relationship_id:id};});
  }
  invite(actor,id,target){const p=this.person(actor,id,true);if(p.claimed_user_id)fail(409,'This profile is already claimed.');const token=randomBytes(32).toString('hex');return this.tx(()=>{this.run('DELETE FROM invitation WHERE person_id=? AND used_at IS NULL',id);this.run('INSERT INTO invitation VALUES(?,?,?,?,?,?,?)',randomUUID(),id,target,hash(token),new Date(Date.now()+7*86400000).toISOString(),null,actor.id);this.audit(actor,'CLAIM_INVITED',id);return {token,expiresInDays:7};});}
  claim(actor,token){const inv=this.get('SELECT invitation_id FROM invitation WHERE token_hash=? AND target_user_id=? AND used_at IS NULL AND expires_at>?',hash(text(token,100)),actor.id,now());if(!inv)fail(404,'Invitation is invalid or expired.');return this.acceptInvitation(actor,inv.invitation_id);}
  verify(actor,id,b){const p=this.person(actor,id),status=b.status,evidence=text(b.evidence,2000);if(!['Family Confirmed','Community Verified','Officially Verified'].includes(status))fail(400,'Choose a verification status.');if(p.owner_user_id===actor.id||p.claimed_user_id===actor.id)fail(403,'Another authorised person must verify this record.');if(status==='Family Confirmed'&&!this.family(actor,p.tree_id))fail(403,'A claimed family member must confirm.');if(status==='Community Verified'&&!actor.platform&&!this.isVerifier(actor,p))fail(403,'Scoped verifier required.');if(status==='Officially Verified'&&!actor.platform)fail(403,'Platform review of official evidence required.');if(status==='Officially Verified'&&!this.get('SELECT 1 FROM document WHERE person_id=?',id))fail(400,'Upload supporting documentation first.');return this.tx(()=>{this.run('INSERT INTO verification_history VALUES(?,?,?,?,?,?)',randomUUID(),id,status,evidence,actor.id,now());this.run('UPDATE person SET verification=?,version=version+1 WHERE person_id=?',status,id);this.audit(actor,'PERSON_VERIFIED',id);return {ok:true};});}
  royal(actor,b){const p=this.person(actor,b.person_id,true);if(!['King','Queen','Chief','Prince','Princess','Traditional Leader'].includes(b.title))fail(400,'Choose a title.');const from=date(b.reign_from),to=date(b.reign_to);if(from&&to&&to<from)fail(400,'Reign end precedes start.');const id=randomUUID();this.run('INSERT INTO leadership VALUES(?,?,?,?,?,?,?,?,?)',id,p.person_id,p.tree_id,b.title,text(b.royal_house),text(b.clan),from,to,b.notes?text(b.notes,2000):'');this.audit(actor,'LEADERSHIP_RECORDED',id);return {leadership_id:id};}
  succeed(actor,b){const a=this.person(actor,b.predecessor_id,true),c=this.person(actor,b.successor_id,true);if(a.tree_id!==c.tree_id||a.person_id===c.person_id)fail(400,'Choose different people in the same tree.');const id=randomUUID();this.run('INSERT INTO succession VALUES(?,?,?,?,?,?,?)',id,a.tree_id,a.person_id,c.person_id,text(b.office),date(b.effective_on),b.notes?text(b.notes,2000):'');this.audit(actor,'SUCCESSION_RECORDED',id);return {succession_id:id};}
}

// Paths use only records visible to the requester; no hidden names or connections leak.
export function relationshipPath(people,relationships,from,to){
  const ids=new Set(people.map(p=>p.person_id));if(!ids.has(from)||!ids.has(to))fail(404,'Person not available.');
  const adjacency=new Map([...ids].map(id=>[id,[]]));
  for(const r of relationships){if(!ids.has(r.from_person_id)||!ids.has(r.to_person_id))continue;adjacency.get(r.from_person_id).push({id:r.to_person_id,label:r.type==='parent'?'child':r.type});adjacency.get(r.to_person_id).push({id:r.from_person_id,label:r.type==='parent'?'parent':r.type});}
  const queue=[{id:from,path:[]}],seen=new Set([from]);
  for(let i=0;i<queue.length;i++){const current=queue[i];if(current.id===to){const labels=current.path.map(p=>p.label),key=labels.join('/');let label=({ '':'Self','parent':'Parent','child':'Child','spouse':'Spouse','sibling':'Sibling','parent/parent':'Grandparent','child/child':'Grandchild','parent/child':'Sibling','parent/parent/child':'Aunt / uncle','parent/child/child':'Niece / nephew','parent/parent/child/child':'First cousin','sibling/child':'Niece / nephew','parent/sibling':'Aunt / uncle','parent/sibling/child':'First cousin'})[key];if(!label&&labels.every(l=>l==='parent'))label=`Ancestor (${labels.length} generations)`;if(!label&&labels.every(l=>l==='child'))label=`Descendant (${labels.length} generations)`;return {label:label||'Extended family connection',path:current.path};}for(const edge of adjacency.get(current.id))if(!seen.has(edge.id)){seen.add(edge.id);queue.push({id:edge.id,path:[...current.path,edge]});}}
  return {label:'No visible relationship path',path:[]};
}

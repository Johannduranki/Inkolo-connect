import test from 'node:test';
import assert from 'node:assert/strict';
import {HeritageStore,relationshipPath} from '../src/heritage-store.js';
const scope={tenant_id:'tenant-a',community_id:'community-a',name:'Community A'};
const admin={id:'admin',name:'Admin',platform:true,scopes:[]};
const member={id:'member',name:'Example Member',platform:false,scopes:[scope]};
function fixture(t){
  const s=new HeritageStore(':memory:');t.after(()=>s.db.close());
  s.configure(admin,[scope],{...scope,tenant_enabled:true,enabled:true});
  const tree=s.createTree(member,{community_id:scope.community_id,name:'Example family'});
  const add=(name,privacy='Family')=>s.createPerson(member,{tree_id:tree.tree_id,display_name:name,privacy}).person_id;
  const link=(a,b,type='parent')=>s.addRelationship(member,{from_person_id:a,to_person_id:b,type,kind:'biological'});
  return {s,tree,add,link};
}

test('enrolment is scoped, idempotent and suspended when disabled',t=>{
  const {s}=fixture(t);
  s.enrol(member,scope.community_id);s.enrol(member,scope.community_id);
  assert.equal(s.subscriptions(member.id).length,1);
  assert.equal(s.subscriptions(member.id)[0].amountCents,0);
  assert.equal(s.subscriptions('someone-else').length,0);
  assert.throws(()=>s.enrol({id:'outsider',scopes:[]},scope.community_id),{status:404});
  s.configure(admin,[scope],{...scope,tenant_enabled:true,enabled:false});
  assert.equal(s.subscriptions(member.id)[0].status,'suspended');
  assert.throws(()=>s.enrol(member,scope.community_id),{status:403});
});

test('invitation inbox is recipient-only and accepting creates subscription',t=>{
  const {s,add}=fixture(t),person=add('Inbox relative');
  s.invite(member,person,'relative');
  const relative={id:'relative',scopes:[scope]},other={id:'other',scopes:[scope]};
  assert.equal(s.invitations(other).length,0);
  const invitation=s.invitations(relative)[0];
  assert.equal(invitation.display_name,'Inbox relative');
  assert.throws(()=>s.acceptInvitation(other,invitation.invitation_id),{status:404});
  s.acceptInvitation(relative,invitation.invitation_id);
  assert.equal(s.invitations(relative).length,0);
  assert.equal(s.subscriptions(relative.id)[0].status,'active');
  assert.equal(s.person(relative,person,true).privacy,'Private');
  assert.throws(()=>s.acceptInvitation(relative,invitation.invitation_id),{status:404});
});
test('tenant isolation, private and family permissions fail closed',t=>{
  const {s,tree,add}=fixture(t),p=add('Relative');
  const stranger={id:'stranger',scopes:[scope]};
  assert.throws(()=>s.person(stranger,p),{status:404});
  assert.throws(()=>s.person(admin,tree.person_id),{status:404});
  assert.throws(()=>s.snapshot({id:'outsider',scopes:[]},scope.community_id),{status:404});
  assert.throws(()=>s.createPerson(stranger,{tree_id:tree.tree_id,display_name:'Injection'}),{status:403});
});
test('duplicates require review, foreign tree edges rejected, cycles rejected',t=>{
  const {s,tree,add,link}=fixture(t),a=add('Parent'),b=add('Grandparent');
  assert.throws(()=>add('Parent'),{status:409});link(b,a);link(a,tree.person_id);
  assert.throws(()=>link(tree.person_id,b),{status:409});
  const other=s.createTree(member,{community_id:scope.community_id,name:'Other family'});
  assert.throws(()=>link(a,other.person_id),{status:400});
  assert.throws(()=>s.run('INSERT INTO relationship VALUES(?,?,?,?,?,?,?)','invalid',tree.tree_id,a,other.person_id,'parent','unspecified',member.id));
});
test('grandparents, cousins, descendants and hidden paths',t=>{
  const {s,tree,add,link}=fixture(t),parent=add('Parent'),grandparent=add('Grandparent'),aunt=add('Aunt'),cousin=add('Cousin');
  link(grandparent,parent);link(parent,tree.person_id);link(grandparent,aunt);link(aunt,cousin);
  const data=s.snapshot(member,scope.community_id),path=(a,b)=>relationshipPath(data.people,data.relationships,a,b);
  assert.equal(path(tree.person_id,grandparent).label,'Grandparent');
  assert.equal(path(tree.person_id,cousin).label,'First cousin');
  assert.equal(path(grandparent,tree.person_id).label,'Grandchild');
  assert.throws(()=>relationshipPath([],data.relationships,tree.person_id,cousin),{status:404});
});
test('claim tokens are account-bound, single-use and remove creator edit access',t=>{
  const {s,add}=fixture(t),p=add('Invited relative'),inv=s.invite(member,p,'relative'),relative={id:'relative',scopes:[scope]};
  assert.throws(()=>s.claim({id:'wrong',scopes:[scope]},inv.token),{status:404});
  s.claim(relative,inv.token);assert.equal(s.person(relative,p,true).privacy,'Private');
  assert.throws(()=>s.person(member,p,true),{status:404});
  assert.throws(()=>s.claim(relative,inv.token),{status:404});
});
test('verification requires independent scoped authority and edits reset status',t=>{
  const {s,add}=fixture(t),p=add('Verified relative','Community'),verifier={id:'verifier',admin:true,scopes:[scope]};
  assert.throws(()=>s.verify(member,p,{status:'Family Confirmed',evidence:'Self'}),{status:403});
  assert.throws(()=>s.verify(verifier,p,{status:'Community Verified',evidence:'Reference'}),{status:403});
  s.run('INSERT INTO verifier VALUES(?,?,?)',verifier.id,scope.tenant_id,scope.community_id);
  s.verify(verifier,p,{status:'Community Verified',evidence:'Community register reference'});
  let person=s.person(member,p);assert.equal(person.verification,'Community Verified');
  s.updatePerson(member,p,{...person,display_name:'Updated relative'});
  assert.equal(s.person(member,p).verification,'Unverified');
  assert.throws(()=>s.verify(admin,p,{status:'Officially Verified',evidence:'Reference'}),{status:400});
});
test('succession is separate from genealogy and service revocation is immediate',t=>{
  const {s,add}=fixture(t),a=add('Leader'),b=add('Successor');
  s.royal(member,{person_id:a,title:'Chief',royal_house:'Example house',clan:'Example clan'});
  s.succeed(member,{predecessor_id:a,successor_id:b,office:'Chief'});
  assert.equal(s.snapshot(member,scope.community_id).relationships.length,0);
  assert.equal(s.snapshot(member,scope.community_id).succession.length,1);
  s.configure(admin,[scope],{...scope,tenant_enabled:false,enabled:true});
  assert.throws(()=>s.person(member,a),{status:403});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {readFileSync} from 'node:fs';
import {submitFuneral,funeralSubscriptions,createFuneralApplicationRouter,registeredFuneralMember} from '../src/funeral-applications.js';
import {funeralState,person,application} from './fixtures/funeral.js';
test('individual cover reuses only the signed-in member registration and ignores supplied replacements',()=>{
 const state=funeralState();state.users=[{id:'member',firstName:'Registered',lastName:'Member',passwordHash:'private'}];state.profiles=[{userId:'member',dateOfBirth:'1990-01-01',idNumber:'private'}];
 assert.deepEqual(registeredFuneralMember(state,'other'),{});
 assert.deepEqual(registeredFuneralMember(state,'member'),{firstName:'Registered',lastName:'Member',dateOfBirth:'1990-01-01'});
 const saved=submitFuneral(state,'member',{...application(),planId:'single',member:undefined,spouse:null,children:[]});assert.deepEqual(saved.member,registeredFuneralMember(state,'member'));
 const again=structuredClone(state);again.funeralApplications=[];assert.deepEqual(submitFuneral(again,'member',{...application(),planId:'single',member:person(),spouse:null,children:[]}).member,saved.member);
});
test('missing registration fields must be supplied, with valid registration-date fallback',()=>{
 const state=funeralState();state.users=[{id:'member',firstName:'Registered',lastName:'Member'}];state.profiles=[{userId:'member',dateOfBirth:'1990-02-31'}];
 const body={...application(),planId:'single',member:{},spouse:null,children:[]};assert.throws(()=>submitFuneral(state,'member',body),{status:400});
 state.registrationDetails=[{userId:'other',details:{dateOfBirth:'1980-01-01'}}];assert.equal(registeredFuneralMember(state,'member').dateOfBirth,undefined);
 state.registrationDetails.push({userId:'member',details:{dateOfBirth:'1990-01-01'}});assert.equal(submitFuneral(state,'member',body).member.dateOfBirth,'1990-01-01');
});
test('optional dependant IDs and spouse telephone are retained without changing price',()=>{
 const body=application();body.spouse.idNumber='0000000000000';body.spouse.contactNumber='+27 00 000 0000';body.children[0].idNumber='1111111111111';
 const saved=submitFuneral(funeralState(),'member',body);
 assert.equal(saved.spouse.idNumber,'0000000000000');assert.equal(saved.spouse.contactNumber,'+27000000000');assert.equal(saved.children[0].idNumber,'1111111111111');assert.equal(saved.amountCents,11000);
 for(const value of ['',null,undefined]){const blank=application();blank.spouse.idNumber=value;blank.spouse.contactNumber=value;blank.children[0].idNumber=value;const result=submitFuneral(funeralState(),'member',blank);assert.deepEqual(result.spouse,person());assert.deepEqual(result.children[0],person());}
});
test('malformed optional details reject the application without storing partial records',()=>{
 for(const [who,key,value] of [['spouse','idNumber','123'],['spouse','idNumber',123],['spouse','contactNumber','invalid'],['spouse','contactNumber',{}],['child','idNumber','not-an-id']]){const state=funeralState(),body=application();(who==='spouse'?body.spouse:body.children[0])[key]=value;const before=JSON.stringify(state);assert.throws(()=>submitFuneral(state,'member',body),{status:400});assert.equal(JSON.stringify(state),before);}
});
test('dashboard monthly total includes pending funeral selling price, not cancelled applications',()=>{
 const source=readFileSync(new URL('../../frontend/src/app/dashboard.component.ts',import.meta.url),'utf8');
 const body=source.split('monthlySubscriptionTotal(): string {')[1].split('\n  }')[0];
 const total=new Function(body).call({subscriptions:()=>[{status:'active',amountCents:1000},{provider:'funeral',status:'pending',amountCents:8500},{provider:'funeral',status:'cancelled',amountCents:5000},{provider:'other',status:'pending',amountCents:3000}]});
 assert.equal(total,'R95.00 p/m');
});
test('family application uses server selling price, preserves details and remains unpaid/unconfirmed',()=>{const state=funeralState();state.unrelated={value:123};const a=submitFuneral(state,'member',application());assert.equal(a.amountCents,11000);assert.equal(a.paymentStatus,'unpaid');assert.equal(a.coverStatus,'pending_provider_confirmation');assert.equal(a.children.length,1);assert.deepEqual(state.unrelated,{value:123});assert.equal(funeralSubscriptions(state,'member','community-test')[0].amountCents,11000);assert.equal(funeralSubscriptions(state,'other','community-test').length,0);assert.equal(funeralSubscriptions(state,'member','other').length,0);state.funeralCoverConfig.plans[1].sellingCents=12000;assert.equal(a.amountCents,11000);assert.throws(()=>submitFuneral(state,'member',application()),{status:409});});
test('single plan accepts member only and four-child limit is enforced',()=>{const s=funeralState();assert.equal(submitFuneral(s,'member',{...application(),planId:'single',spouse:null,children:[]}).amountCents,8500);const four={...application(),children:Array.from({length:4},person)};assert.equal(submitFuneral(funeralState(),'member',four).children.length,4);for(const body of [{...four,children:[...four.children,person()]},{...application(),planId:'single'},{...application(),accepted:false},{...application(),revision:0},{...application(),member:{...person(),dateOfBirth:'2000-02-31'}}])assert.throws(()=>submitFuneral(funeralState(),'member',body));});
test('membership and community service availability are required',()=>{assert.throws(()=>submitFuneral(funeralState(),'outsider',application()),{status:403});const s=funeralState();s.servicePricing={'funeral-cover':{enabled:false}};assert.throws(()=>submitFuneral(s,'member',application()),{status:403});});
test('HTTP responses hide costs and cross-account records; cancellation preserves details',async t=>{
 const state=funeralState(),app=express();app.use(express.json());app.use('/member',createFuneralApplicationRouter({requireAuth:(req,res,next)=>{if(!req.headers.authorization)return res.sendStatus(401);req.auth={sub:req.headers.authorization};next();},resolveUser:async()=>({status:'active'}),readState:()=>state,updateState:async fn=>fn(state)}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const url='http://127.0.0.1:'+server.address().port+'/member';
 const request=(method,body,who='member',suffix='')=>fetch(url+suffix,{method,headers:{Authorization:who,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 assert.equal((await fetch(url)).status,401);const catalogue=await(await request('GET')).json();assert.equal(JSON.stringify(catalogue).includes('costCents'),false);assert.equal(JSON.stringify(catalogue).includes('markup'),false);
 const created=await request('POST',application());assert.equal(created.status,201);const saved=await created.json();assert.equal((await request('GET',null,'other')).status,403);assert.equal((await request('POST',{id:saved.id},'other','/cancel')).status,404);assert.equal((await request('POST',{id:saved.id},'member','/cancel')).status,200);assert.equal(funeralSubscriptions(state,'member','community-test').length,0);assert.deepEqual(state.funeralApplications[0].member,person());
});

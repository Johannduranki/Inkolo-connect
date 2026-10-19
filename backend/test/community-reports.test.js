import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {communityReport,reportCommunities,createCommunityReportsRouter} from '../src/community-reports.js';
const community={id:'c',aliases:['legacy'],kind:'community',tenantId:'t',name:'Community'};
const state={importedCommunities:[{id:'legacy',platformCommunityId:'c',tenantId:'t',tenantName:'Tenant',name:'Community'},{id:'other',tenantId:'other',name:'Other'}],users:[{id:1,firstName:'Member',lastName:'One',status:'active'}],memberCommunities:[{memberId:1,tenantId:'t',communityId:'legacy'},{memberId:1,tenantId:'t',communityId:'c'}],serviceSubscriptions:[{userId:1,communityId:'c',status:'active',serviceCode:'training'},{userId:1,status:'active',serviceCode:'unscoped'},{userId:1,communityId:'other',status:'active',serviceCode:'private'},{userId:1,communityId:'c',status:'terminated',serviceCode:'funeral',terminationReason:'non_payment'}],tenantStaff:[{userId:'staff',tenantId:'t',status:'active',permissions:['reports.view']}]};
test('counts unique members; scopes services; never guesses arrears or reasons',()=>{
 const r=communityReport(state,community,[],[],'2026-01-01','2026-12-31');assert.equal(r.summary.members,1);assert.equal(r.members[0].name,'Member One');assert.equal(r.summary.activeServices,1);assert.equal(r.summary.terminatedForNonpayment,1);assert.equal(r.summary.unallocatedServices,1);assert.equal(r.members[0].services.length,2);assert.deepEqual(r.totals,[]);
 const copy=structuredClone(state);delete copy.serviceSubscriptions[3].terminationReason;assert.equal(communityReport(copy,community,[],[],'2026-01-01','2026-12-31').summary.terminatedForNonpayment,0);
});
test('payments exclude sandbox and other tenants; separate sources, dates and reviews',()=>{
 const row={user_id:'1',tenant_id:'t',community_id:'legacy',mode:'live',status:'CHARGED',amount_cents:2500,currency:'ZAR',created_at:'2025-01-01',charged_at:'2026-06-01'};
 const r=communityReport(state,community,[row,{...row,mode:'sandbox'},{...row,tenant_id:'other'},{...row,charged_at:'2025-12-01'},{...row,review_required:1},{...row,status:'PENDING',created_at:'2026-07-01'}],[{...row,received_cents:2500,received_on:'2026-06-01'}],'2026-01-01','2026-12-31');
 assert.equal(r.payments.length,4);assert.equal(r.totals.length,4);assert.equal(r.totals.find(t=>t.status==='Review required').count,1);
});
test('reporting permission is scoped, revocable, and not inferred from a role name',()=>{
 assert.equal(reportCommunities(state,{id:'staff',status:'active',roles:['Member']}).length,1);
 assert.equal(reportCommunities(state,{id:'staff',status:'inactive',roles:['Platform Admin']}).length,0);
 assert.equal(reportCommunities(state,{id:'unknown',status:'active',roles:['Community Admin']}).length,0);
 assert.equal(reportCommunities(state,{id:'admin',status:'active',roles:['Platform Admin']}).length,2);
});
test('API denies cross-tenant reports and invalid dates before reading financial records',async t=>{
 const current=structuredClone(state);current.users.push({id:'staff',status:'active',roles:['Member']});
 const app=express();let reads=0;app.use('/reports',createCommunityReportsRouter({requireAuth:(req,res,next)=>{if(!req.get('x-user'))return res.sendStatus(401);req.auth={sub:req.get('x-user')};next();},resolveUser:async id=>({id,status:'active',roles:['Member']}),readState:()=>current,cycleStore:{tenantCharges:async()=>{reads++;return [];}},treasuryStore:{tenantReceipts:async()=>[]},databaseAvailable:false}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{server.closeAllConnections();server.close();});const url='http://127.0.0.1:'+server.address().port+'/reports';const headers={'x-user':'staff'};
 assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url+'?communityId=other',{headers})).status,403);assert.equal((await fetch(url+'?communityId=c&from=2026-02-30',{headers})).status,400);assert.equal(reads,0);const response=await fetch(url+'?communityId=legacy',{headers});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).summary.members,1);
});

for(const change of ['grant','inactive','role','community'])test(`report response rejects ${change} changes while financial data is loading`,async t=>{
 const current=structuredClone(state);current.users.push({id:'staff',status:'active',roles:change==='role'?['Platform Admin']:['Member']});
 if(change==='role')current.tenantStaff=[];
 const app=express();app.use('/reports',createCommunityReportsRouter({
  requireAuth:(req,res,next)=>{req.auth={sub:'staff'};next();},resolveUser:async()=>current.users.find(u=>u.id==='staff'),readState:()=>current,
  cycleStore:{tenantCharges:async()=>[{user_id:'1',tenant_id:'t',community_id:'c',mode:'live',status:'CHARGED',amount_cents:2500,currency:'ZAR',charged_at:'2026-01-01',reference:'private-reference'}]},
  treasuryStore:{tenantReceipts:async()=>{
   if(change==='grant')current.tenantStaff[0].status='revoked';
   if(change==='inactive')current.users.find(u=>u.id==='staff').status='inactive';
   if(change==='role')current.users.find(u=>u.id==='staff').roles=['Member'];
   if(change==='community')current.importedCommunities[0].tenantId='other';
   return [];
  }},databaseAvailable:false
 }));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>{server.closeAllConnections();server.close();});
 const response=await fetch(`http://127.0.0.1:${server.address().port}/reports?communityId=c`);
 assert.equal(response.status,403);assert.equal(response.headers.get('cache-control'),'no-store');assert.doesNotMatch(await response.text(),/private-reference|Member One|2500/);
});

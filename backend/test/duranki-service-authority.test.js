import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createServicePricingRouter} from '../src/service-pricing.js';
import {effectiveServicePrice,serviceEnabled,storeServiceSetting} from '../src/service-scope.js';

const fixture=()=>({users:[{id:'admin',status:'active',roles:['Platform Admin']},{id:'tenant',status:'active',roles:['Tenant Staff']}],tenantAccessDirectory:[{id:'t',name:'Tenant'}],tenantStaff:[{userId:'tenant',tenantId:'t',status:'active',permissions:['services.manage','users.manage']}],servicePricing:{wallet:{mode:'free',amountCents:0,revision:1,enabled:true}},tenantServicePricing:{t:{wallet:{mode:'paid',amountCents:900,enabled:false}}},communityServicePricing:{c:{wallet:{enabled:false}}},serviceSubscriptions:[{amountCents:1234}],cycleServiceAvailability:{tenants:[{id:'t',status:'active',serviceCodes:[]}],communities:[{id:'c',tenantId:'t',status:'active',serviceCodes:[]}]}});
test('Duranki pricing and availability ignore preserved overrides without changing agreements',()=>{
 const s=fixture();s.durankiServiceAssignments={t:{serviceCodes:['wallet'],revision:1}};const before=structuredClone(s),community={id:'c',tenantId:'t'};
 assert.equal(effectiveServicePrice(s,'wallet',community).amountCents,0);
 assert.equal(serviceEnabled(s,community,'wallet'),true);
 assert.deepEqual(s,before);
 s.servicePricing.wallet.enabled=false;assert.equal(serviceEnabled(s,community,'wallet'),false);
 s.servicePricing.wallet.enabled=true;s.cycleServiceAvailability.communities[0].status='disabled';assert.equal(serviceEnabled(s,community,'wallet'),false);
 assert.equal(serviceEnabled(s,community,'unknown'),false);
});
test('tenant permissions and platform administrators cannot write scoped overrides',()=>{
 const s=fixture();
 for(const id of ['admin','tenant'])assert.throws(()=>storeServiceSetting(s,id,'wallet',{tenantId:'t'},{revision:0},{mode:'free',amountCents:0}),{status:403});
});
test('configuration endpoints only permit Duranki and preserve member-safe reads',async t=>{
 const s=fixture(),app=express();app.use(express.json());app.use(createServicePricingRouter({requireAuth:(req,res,next)=>{req.auth={sub:req.get('x-user')};next();},resolveUser:async id=>s.users.find(u=>u.id===id),readState:()=>s,updateState:fn=>fn(s)}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.closeAllConnections();server.close();});
 const call=(user,path,body)=>fetch(`http://127.0.0.1:${server.address().port}${path}`,{method:body?'PUT':'GET',headers:{'x-user':user,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 assert.equal((await call('tenant','/scopes')).status,200);assert.equal((await call('tenant','/')).status,403);
 assert.equal((await(await call('admin','/scopes')).json()).platform,true);
 assert.equal((await call('admin','/wallet?tenantId=t',{revision:0})).status,403);
 const before=structuredClone(s.serviceSubscriptions);
 s.tenantAccessDirectory.push({id:'other',name:'Other tenant'});
 assert.equal((await call('tenant','/?tenantId=other')).status,403);
 assert.equal((await call('tenant','/assignments?tenantId=t')).status,403);
 assert.equal((await call('tenant','/assignments',{tenantId:'t',serviceCodes:['wallet'],revision:0})).status,403);
 assert.equal((await call('admin','/assignments',{tenantId:'t',serviceCodes:['unknown'],revision:0})).status,400);
 assert.equal((await call('admin','/assignments',{tenantId:'t',serviceCodes:['wallet'],revision:0})).status,200);
 assert.equal((await call('admin','/assignments',{tenantId:'t',serviceCodes:[],revision:0})).status,409);
 const rows=(await(await call('tenant','/?tenantId=t')).json()).services;
 assert.deepEqual(rows.map(r=>r.code),['wallet']);const row=rows[0];assert.equal(row.amountCents,0);assert.equal('costCents' in row,false);assert.equal('shares' in row,false);
 assert.equal((await call('tenant','/wallet',{mode:'free',amountCents:0,revision:1})).status,403);
 assert.equal((await call('admin','/assignments',{tenantId:'t',serviceCodes:[],revision:1})).status,200);
 assert.deepEqual((await(await call('tenant','/?tenantId=t')).json()).services,[]);assert.deepEqual(s.serviceSubscriptions,before);
});

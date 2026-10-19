import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createPlatformRouter } from '../src/platform-api.js';
import { rideLocation,rideOfferInput,visibleRideOffers,visibleRideRequests } from '../src/ride-security.js';

function fixture() {
  const users=['rider','driver','other','foreign','disabled'].map(id=>({id,firstName:id,lastName:'Member',telephoneNumber:'private-'+id,status:id==='disabled'?'inactive':'active',roles:['Member']}));
  return {users,
    importedCommunities:[{id:'alias-a',platformCommunityId:'community-a',tenantId:'tenant-a',name:'A'},{id:'alias-b',platformCommunityId:'community-b',tenantId:'tenant-b',name:'B'}],
    memberCommunities:users.map(user=>({memberId:user.id,communityId:user.id==='foreign'?'community-b':'alias-a',tenantId:user.id==='foreign'?'tenant-b':'tenant-a'})),
    availableLifts:['driver','foreign','disabled'].map(id=>({id:'lift-'+id,driverUserId:id,driverName:id,driverTelephone:'secret-phone',latitude:-29.1,longitude:31.1,vehicle:'Vehicle',registrationNumber:'TEST',seatsAvailable:2,available:true,distanceKm:2,directionDegrees:90,rating:4,destination:'Town',departureTime:'08:00',privateNote:'secret-note'})),
    rideRequests:[],businessProfiles:[{id:'business-a',ownerUserId:'driver',status:'ACTIVE',services:['CATCH_A_RIDE'],businessName:'Test Business',telephone:'business-phone'}]
  };
}
const pickup={liftId:'lift-driver',latitude:-29.2,longitude:31.2,pickupLabel:'Test pickup'};
const offer={latitude:-29.1,longitude:31.1,vehicle:'Vehicle',registrationNumber:'TEST',seatsAvailable:2,destination:'Town',departureTime:'08:00'};
async function harness(t) {
  let state=fixture(),beforeWrite=()=>{};
  const app=express();app.use(express.json());app.use('/platform',createPlatformRouter({
    requireAuth:(req,res,next)=>{if(!req.get('x-user'))return res.sendStatus(401);req.auth={sub:req.get('x-user')};next();},
    readPlatformState:()=>state,updatePlatformState:fn=>{beforeWrite(state);const draft=structuredClone(state),result=fn(draft);state=draft;return result;}
  }));
  app.use((error,req,res,next)=>res.status(error.status||500).json({message:'Request rejected'}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>{server.closeAllConnections();server.close();});
  return {state:()=>state,before:fn=>{beforeWrite=fn;},call:(method,path,body,user='rider')=>fetch(`http://127.0.0.1:${server.address().port}/platform/rides${path}`,{method,headers:{'x-user':user,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)})};
}

test('ride browsing uses shared active community membership and omits private fields without altering stored offers',()=>{
  const state=fixture(),before=structuredClone(state);
  const rows=visibleRideOffers(state,'rider','community-a');assert.deepEqual(rows.map(row=>row.id),['lift-driver']);
  for(const key of ['driverTelephone','driverUserId','latitude','longitude','privateNote'])assert.equal(Object.hasOwn(rows[0],key),false,key);
  assert.deepEqual(state,before);
  assert.throws(()=>visibleRideOffers(state,'rider','community-b'),{status:403});
  state.users[0].roles=['Platform Admin'];assert.equal(visibleRideOffers(state,'rider').length,1);
  state.memberCommunities.push({memberId:'rider',communityId:'alias-b',tenantId:'tenant-b'});
  assert.deepEqual(visibleRideOffers(state,'rider','community-b').map(row=>row.id),['lift-foreign']);
});

test('ride location and seat validation reject coercion, invalid ranges and fractions',()=>{
  for(const latitude of [null,undefined,'',true,'12',NaN,Infinity,-91,91])assert.throws(()=>rideLocation({latitude,longitude:0}),{status:400});
  for(const longitude of [-181,181,null,'0'])assert.throws(()=>rideLocation({latitude:0,longitude}),{status:400});
  assert.deepEqual(rideLocation({latitude:0,longitude:0}),{latitude:0,longitude:0});
  for(const seatsAvailable of [0,9,1.5,'2',null])assert.throws(()=>rideOfferInput({...offer,seatsAvailable}),{status:400});
  assert.throws(()=>rideOfferInput({...offer,vehicle:'x'.repeat(101)}),{status:400});
});

test('ride APIs require active authentication and preserve private owner access',async t=>{
  const h=await harness(t);
  assert.equal((await h.call('GET','/available',undefined,'')).status,401);
  assert.equal((await h.call('GET','/available',undefined,'disabled')).status,403);
  const response=await h.call('GET','/available');assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual((await response.json()).map(row=>row.id),['lift-driver']);
  assert.equal((await h.call('GET','/available?communityId=community-b')).status,403);
  assert.equal((await h.call('GET','/offers/mine',undefined,'driver')).status,200);
  const own=await (await h.call('GET','/offers/mine',undefined,'driver')).json();assert.equal(own.latitude,-29.1);
  assert.equal(await (await h.call('GET','/offers/mine')).json(),null);
});

test('only a shared-community member can request a ride; duplicate pending requests reuse the original record',async t=>{
  const h=await harness(t);
  assert.equal((await h.call('POST','/requests',{...pickup,liftId:'lift-foreign'})).status,404);
  assert.equal((await h.call('POST','/requests',pickup,'driver')).status,400);
  const created=await (await h.call('POST','/requests',{...pickup,passengerUserId:'foreign',driverUserId:'foreign',status:'ACCEPTED'})).json();
  assert.equal(created.passengerUserId,'rider');assert.equal(created.driverUserId,'driver');assert.equal(created.status,'PENDING');
  const repeated=await (await h.call('POST','/requests',pickup)).json();assert.equal(repeated.id,created.id);assert.equal(h.state().rideRequests.length,1);
  const other=await (await h.call('GET','/requests',undefined,'other')).json();assert.deepEqual(other,{incoming:[],outgoing:[]});
  const incoming=await (await h.call('GET','/requests',undefined,'driver')).json();assert.equal(incoming.incoming[0].pickupLatitude,pickup.latitude);
});

for(const [name,change,status] of [
  ['passenger disabled',s=>{s.users[0].status='inactive';},403],
  ['driver disabled',s=>{s.users[1].status='inactive';},404],
  ['membership revoked',s=>{s.memberCommunities=s.memberCommunities.filter(m=>m.memberId!=='driver');},404],
  ['lift unavailable',s=>{s.availableLifts[0].available=false;},404]
])test(`ride requests recheck ${name} inside the write queue`,async t=>{
  const h=await harness(t);h.before(change);assert.equal((await h.call('POST','/requests',pickup)).status,status);assert.equal(h.state().rideRequests.length,0);
});

test('offer writes recheck actor and business ownership and reject truthy availability strings',async t=>{
  const h=await harness(t);
  assert.equal((await h.call('PATCH','/offers/mine',{available:'false'},'driver')).status,400);
  h.before(s=>{s.businessProfiles[0].status='INACTIVE';});
  assert.equal((await h.call('POST','/offers',{...offer,businessProfileId:'business-a'},'driver')).status,403);
  assert.equal(h.state().availableLifts[0].businessName,undefined);
  h.before(s=>{s.users[1].status='inactive';});
  assert.equal((await h.call('PATCH','/offers/mine',{available:false},'driver')).status,403);
  assert.equal(h.state().availableLifts[0].available,true);
});

test('ride acceptance checks driver, membership and current offer; cancellation remains possible after membership loss',async t=>{
  const h=await harness(t),created=await (await h.call('POST','/requests',pickup)).json();
  assert.equal((await h.call('PATCH','/requests/'+created.id,{status:'ACCEPTED'},'other')).status,403);
  assert.equal((await h.call('PATCH','/requests/'+created.id,{status:'ACCEPTED'},'rider')).status,403);
  h.before(s=>{s.availableLifts[0].available=false;});
  assert.equal((await h.call('PATCH','/requests/'+created.id,{status:'ACCEPTED'},'driver')).status,409);
  assert.equal(h.state().rideRequests[0].status,'PENDING');
  h.before(()=>{});h.state().memberCommunities=h.state().memberCommunities.filter(m=>m.memberId!=='driver');
  assert.equal((await h.call('PATCH','/requests/'+created.id,{status:'ACCEPTED'},'driver')).status,404);
  assert.equal((await h.call('PATCH','/requests/'+created.id,{status:'CANCELLED'},'rider')).status,200);
});

test('terminal ride requests redact passenger contact/location for drivers while retaining original records and passenger history',async t=>{
  const h=await harness(t),created=await (await h.call('POST','/requests',pickup)).json();
  assert.equal((await h.call('PATCH','/requests/'+created.id,{status:'DECLINED'},'driver')).status,200);
  h.state().rideRequests[0].unknownPrivateField='hidden';
  const before=structuredClone(h.state()),incoming=visibleRideRequests(h.state(),'driver').incoming[0];
  for(const key of ['passengerTelephone','pickupLatitude','pickupLongitude','unknownPrivateField'])assert.equal(Object.hasOwn(incoming,key),false,key);
  assert.equal(visibleRideRequests(h.state(),'rider').outgoing[0].pickupLatitude,pickup.latitude);
  assert.deepEqual(h.state(),before);
  h.state().memberCommunities=h.state().memberCommunities.filter(m=>m.memberId!=='rider');
  assert.deepEqual(visibleRideRequests(h.state(),'driver').incoming,[]);
});

test('authorized personal offers and ride acceptance still work',async t=>{
  const h=await harness(t);
  assert.equal((await h.call('POST','/offers',offer,'driver')).status,201);
  const created=await (await h.call('POST','/requests',pickup)).json();
  const accepted=await h.call('PATCH','/requests/'+created.id,{status:'ACCEPTED'},'driver');assert.equal(accepted.status,200);
  assert.equal((await accepted.json()).driverMessage,'On my way');
  assert.equal((await h.call('PATCH','/requests/'+created.id,{status:'ACCEPTED'},'driver')).status,403);
  assert.equal(h.state().rideRequests.length,1);
});

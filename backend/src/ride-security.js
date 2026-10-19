import { communityPeerIds, requireCommunityPeer } from './community-messaging-security.js';

const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
export function activeRideUser(state,userId) {
  const user=state.users.find(user=>String(user.id)===String(userId));
  if(user?.status!=='active')fail(403,'Active account required.');
  return user;
}
export function rideLocation(body) {
  const {latitude,longitude}=body||{};
  if(typeof latitude!=='number'||typeof longitude!=='number'||!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude < -90||latitude > 90||longitude < -180||longitude > 180)fail(400,'Share a valid pickup or driver location.');
  return {latitude,longitude};
}
export function rideOfferInput(body) {
  const location=rideLocation(body),details={};
  for(const [key,max] of [['vehicle',100],['registrationNumber',30],['destination',200],['departureTime',100]]) {
    if(typeof body[key]!=='string'||!body[key].trim()||body[key].length>max)fail(400,'Complete valid vehicle and trip details.');
    details[key]=body[key].trim();
  }
  if(!Number.isInteger(body.seatsAvailable)||body.seatsAvailable<1||body.seatsAvailable>8)fail(400,'Choose between 1 and 8 seats.');
  return {...location,...details,seatsAvailable:body.seatsAvailable};
}
const select=(record,fields)=>Object.fromEntries(fields.filter(key=>record[key]!==undefined).map(key=>[key,record[key]]));
export function visibleRideOffers(state,userId,communityId) {
  const peers=communityPeerIds(state,userId,communityId);
  return (state.availableLifts||[]).filter(lift=>lift.available===true&&Number(lift.distanceKm)>=0&&Number(lift.distanceKm)<=10&&
    (String(lift.driverUserId)===String(userId)||peers.has(String(lift.driverUserId))))
    .sort((a,b)=>a.distanceKm-b.distanceKm)
    .map(lift=>select(lift,['id','driverName','vehicle','registrationNumber','seatsAvailable','rating','distanceKm','directionDegrees','destination','departureTime','businessName','available']));
}
export function requestableLift(state,userId,liftId,communityId) {
  const passenger=activeRideUser(state,userId);
  const lift=(state.availableLifts||[]).find(lift=>lift.id===liftId&&lift.available===true);
  if(!lift)fail(404,'Available lift not found.');
  if(String(lift.driverUserId)===String(userId))fail(400,'You cannot request your own lift.');
  requireCommunityPeer(state,userId,lift.driverUserId,communityId);
  return {passenger,lift};
}
export function rideRequestView(request,viewerId) {
  if(![String(request.passengerUserId),String(request.driverUserId)].includes(String(viewerId)))fail(404,'Ride request not found.');
  const fields=['id','liftId','passengerUserId','passengerName','driverUserId','driverName','vehicle','requestedAt','status','driverMessage','updatedAt'];
  const visible=select(request,fields);
  const sharePickup=String(request.passengerUserId)===String(viewerId)||['PENDING','ACCEPTED'].includes(request.status);
  if(sharePickup)Object.assign(visible,select(request,['passengerTelephone','pickupLatitude','pickupLongitude','pickupLabel']));
  else visible.pickupLabel='Pickup details no longer shared';
  return visible;
}
export function visibleRideRequests(state,userId) {
  const peers=communityPeerIds(state,userId);
  const requests=state.rideRequests||[];
  const ordered=records=>records.sort((a,b)=>String(b.requestedAt).localeCompare(String(a.requestedAt))).map(request=>rideRequestView(request,userId));
  return {
    outgoing:ordered(requests.filter(request=>String(request.passengerUserId)===String(userId))),
    incoming:ordered(requests.filter(request=>String(request.driverUserId)===String(userId)&&peers.has(String(request.passengerUserId))))
  };
}

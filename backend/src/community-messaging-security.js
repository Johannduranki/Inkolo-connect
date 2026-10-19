import {findMembership,joinableCommunities} from './community-registration.js';

const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
export function communityPeerIds(state,userId,communityId){
  if(communityId!==undefined&&(typeof communityId!=='string'||!communityId.trim()||communityId.length>200))fail(400,'Choose a valid community.');
  const user=state.users.find(u=>String(u.id)===String(userId));
  if(user?.status!=='active')fail(403,'Active account required.');
  let scopes=joinableCommunities(state).filter(c=>findMembership(state,userId,c));
  if(communityId){
    scopes=scopes.filter(c=>c.id===communityId||c.aliases?.includes(communityId));
    if(scopes.length!==1)fail(403,'You are not registered in the selected community.');
  }
  return new Set(state.users.filter(u=>u.status==='active'&&String(u.id)!==String(userId)&&scopes.some(c=>findMembership(state,u.id,c))).map(u=>String(u.id)));
}
export function requireCommunityPeer(state,userId,peerId,communityId){
  if(!communityPeerIds(state,userId,communityId).has(String(peerId)))fail(404,'Community member not available.');
  return state.users.find(u=>String(u.id)===String(peerId));
}
export function participantMessage(message,userId,peerId){
  return (String(message.senderUserId)===String(userId)&&String(message.recipientUserId)===String(peerId))||
    (String(message.senderUserId)===String(peerId)&&String(message.recipientUserId)===String(userId));
}

import express from 'express';
import { brandingDirectory } from './branding.js';
import { tenantDirectory } from './tenant-access.js';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export function joinableCommunities(state) {
  const tenants = tenantDirectory(state);
  return brandingDirectory(state).filter(c => c.kind === 'community').filter(c => {
    const tenant = tenants.find(t => t.id === c.tenantId);
    const source = (state.importedCommunities || []).find(s => s.id === c.id || s.platformCommunityId === c.id);
    const church = (state.churches || []).find(s => [c.id, ...(c.aliases || [])].includes(s.id));
    return tenant && [tenant, c, source, church].every(row => !row?.status || ['active','configured'].includes(String(row.status).toLowerCase()));
  }).map(c => ({...c, tenantName: tenants.find(t => t.id === c.tenantId).name}));
}
export function findMembership(state, userId, community) {
  return (state.memberCommunities || []).find(m => String(m.memberId) === String(userId) &&
    (!m.tenantId || m.tenantId === community.tenantId) &&
    [community.id, ...(community.aliases || [])].includes(m.communityId || m.churchId));
}
export function registerCommunityMember(state, userId, communityId) {
  const user = state.users.find(u => String(u.id) === String(userId));
  if (user?.status !== 'active') fail(403, 'Your account is unavailable.');
  const community = joinableCommunities(state).find(c => c.id === communityId || c.aliases?.includes(communityId));
  if (!community) fail(400, 'Choose an available community.');
  const existing = findMembership(state, userId, community);
  // Keep legacy community identifiers so existing member pages and services agree.
  const id = community.aliases?.[0] || community.id;
  const membership = existing || {memberId:String(userId), tenantId:community.tenantId,
    platformCommunityId:community.id,
    communityId:id, communityName:community.name, churchId:id, churchName:community.name,
    branchId:'', branchName:'', isPrimary:!(state.memberCommunities || []).some(m => String(m.memberId) === String(userId))};
  user.roles = [...new Set([...(user.roles || []), 'Member'])];
  if (!existing) {
    (state.memberCommunities ??= []).push(membership);
    (state.communityRegistrationAudit ??= []).push({actorId:String(userId), communityId:id,
      tenantId:community.tenantId, action:'SELF_JOIN', at:new Date().toISOString()});
  }
  return {alreadyMember:!!existing, membership, roles:user.roles};
}
export function createCommunityRegistrationRouter({requireAuth, resolveUser, readState, updateState, databaseAvailable}) {
  const router = express.Router();
  router.use(requireAuth);
  router.use(async (req,res,next) => { try {
    res.set('Cache-Control','no-store');
    if (databaseAvailable) return res.status(503).json({message:'Community registration requires the SQL membership adapter before database cutover.'});
    const user = await resolveUser(req.auth.sub);
    if (user?.status !== 'active') return res.sendStatus(403);
    next();
  } catch(error) { next(error); } });
  router.get('/', (req,res) => {
    const state = readState();
    const user = state.users.find(u => String(u.id) === String(req.auth.sub));
    res.json({roles:user.roles || [], communities:joinableCommunities(state).map(c => ({
      id:c.id, name:c.name, tenantName:c.tenantName, joined:!!findMembership(state,req.auth.sub,c),
      memberCommunityId:c.aliases?.[0] || c.id
    }))});
  });
  router.post('/', async (req,res) => {
    const result = await updateState(state => registerCommunityMember(state,req.auth.sub,req.body?.communityId));
    res.status(result.alreadyMember ? 200 : 201).json(result);
  });
  router.use((error,_req,res,next) => error.status ? res.status(error.status).json({message:error.message}) : next(error));
  return router;
}

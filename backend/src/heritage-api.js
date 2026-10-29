import { serviceStorageTenant } from './trader-community-hierarchy.js';
export function heritageScopes(state){
  const scopes=new Map();
  for(const c of state.importedCommunities||[])if(c.tenantId)scopes.set(c.id,{tenant_id:c.tenantId,community_id:c.id,name:c.name});
  for(const c of state.churches||[])if(c.tenantId)scopes.set(c.id,{tenant_id:c.tenantId,community_id:c.id,name:c.name});
  for(const m of state.memberCommunities||[])if(m.tenantId){const id=m.communityId||m.churchId;scopes.set(id,{tenant_id:m.tenantId,community_id:id,name:m.communityName||m.churchName});}
  return [...scopes.values()].map(scope => ({ ...scope, tenant_id: serviceStorageTenant(state, scope.tenant_id, scope.community_id) }));
}
export { createMysqlHeritageRouter as createHeritageRouter } from './mysql-heritage-api.js';

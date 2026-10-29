export const normalizeImportPhone=value=>{
  let digits=String(value||'').replace(/\D/g,'');
  if(digits.startsWith('0027'))digits=digits.slice(2);
  return digits.startsWith('27')&&digits.length===11?'0'+digits.slice(2):digits;
};
export const coreCommunityMapping={
  1:{id:'community-zuc',tenantId:'tenant-zuc',tenantName:'ZUC',name:'ZUC Community',type:'Church'},
  2:{id:'trader-ilembe',platformCommunityId:'community-ilembe-traders',tenantId:'tenant-inkolo',tenantName:'Inkolo Connect',name:'Trader Connect',type:'Traders'},
  16:{id:'community-core-inkolo',tenantId:'tenant-inkolo',tenantName:'Inkolo Connect',name:'Inkolo Connect',type:'General'}
};
const demoPhones=['0712345678','0725550184','0736614209','0789441132','0741002003','0763004005','0795006007','0817008009','0714101001','0714101002','0714101003','0714101004','0714101005','0714101006','0714101007','0714101008','0714101009','0714101010','0829001001'];
export function buildCoreImport(original,source){
  const state=structuredClone(original),removed=state.users.filter(u=>(demoPhones.includes(normalizeImportPhone(u.telephoneNumber))&&String(u.email||'').endsWith('.local'))||(u.id===20&&u.firstName==='Fresh'&&u.lastName==='Registration'&&normalizeImportPhone(u.telephoneNumber)==='0719998898'));
  const removedIds=new Set(removed.map(u=>String(u.id)));
  const referenceKeys=['userId','memberId','ownerId','ownerUserId','sellerUserId','senderId','recipientId','fromUserId','toUserId','createdByUserId'];
  const removedWallets=new Set((state.wallets||[]).filter(w=>removedIds.has(String(w.ownerId))).map(w=>w.id));
  for(const [key,rows] of Object.entries(state))if(Array.isArray(rows)&&key!=='users')state[key]=rows.filter(row=>!referenceKeys.some(field=>removedIds.has(String(row[field])))&&!removedWallets.has(row.walletId));
  state.users=state.users.filter(u=>!removedIds.has(String(u.id)));
  const admins=state.users.filter(u=>u.status==='active'&&u.roles?.includes('Platform Admin'));
  if(admins.length!==1)throw new Error('Provision exactly one authorised platform administrator before this legacy import.');
  const admin=admins[0];
  const groups=new Map();for(const u of source.users){const p=normalizeImportPhone(u.phone_number);groups.set(p,[...(groups.get(p)||[]),u.id]);}
  const members=new Map(),roles=new Map();
  for(const m of source.members)if(m.user_id)members.set(m.user_id,[...(members.get(m.user_id)||[]),m]);
  for(const r of source.user_role)roles.set(r.user_id,[...(roles.get(r.user_id)||[]),r]);
  const review=[],sourceMap={},membershipCounts={};
  state.importedCommunities=Object.values(coreCommunityMapping);
  state.memberCommunities ||= [];state.profiles ||= [];
  for(const c of state.importedCommunities){
    state.churches=state.churches.filter(church=>church.id!==c.id);
    state.churches.push({...c,status:'ACTIVE',denomination:c.type,region:'',province:''});
  }
  for(const record of source.users){
    const phone=normalizeImportPhone(record.phone_number),isAdmin=phone===admin.telephoneNumber;
    const id=isAdmin?admin.id:2000000+Number(record.id);
    sourceMap[record.id]=id;
    const existing=state.users.find(u=>u.id===id);
    if(existing&&!isAdmin&&existing.importSource!=='duranki-core')throw new Error('Destination ID collision.');
    if(state.users.some(u=>u.id!==id&&normalizeImportPhone(u.telephoneNumber)===phone&&!u.importSource))throw new Error('Source phone overlaps a local non-demo account; review required.');
    const linked=members.get(record.id)||[],assigned=roles.get(record.id)||[];
    const sourceCommunities=[...new Set([record.community_id,...linked.map(m=>m.community_id),...assigned.map(r=>r.community_id)].filter(Boolean))];
    const mapped=sourceCommunities.map(c=>coreCommunityMapping[c]).filter(Boolean);
    const issues=[];
    if((groups.get(phone)||[]).length>1)issues.push('duplicate_phone');
    if(!/^0\d{9}$/.test(phone))issues.push('invalid_phone');
    if(!mapped.length)issues.push('community_mapping_required');
    const unknown=sourceCommunities.filter(c=>!coreCommunityMapping[c]);
    if(unknown.length)review.push({sourceUserId:record.id,userId:id,reason:'unmapped_source_community',communityIds:unknown});
    if(issues.length)review.push({sourceUserId:record.id,userId:id,reasons:issues});
    if(!isAdmin){
      const user={id,firstName:record.first_name||linked[0]?.first_name||'',lastName:record.last_name||linked[0]?.last_name||'',telephoneNumber:phone,email:record.email||null,
        roles:['Member'],status:issues.length?'inactive':record.status,passwordHash:record.password,passwordFormat:'bcrypt',importSource:'duranki-core',sourceUserId:record.id,sourceStatus:record.status,
        sourceCommunityIds:sourceCommunities,sourceRoleIds:assigned.map(r=>r.role_id),importReview:issues};
      state.users=state.users.filter(u=>u.id!==id);state.users.push(user);
    }else{admin.sourceUserId=record.id;admin.importSource='duranki-core-superuser';}
    state.memberCommunities=state.memberCommunities.filter(m=>String(m.memberId)!==String(id));
    for(const c of mapped){state.memberCommunities.push({memberId:String(id),tenantId:c.tenantId,communityId:c.id,communityName:c.name,churchId:c.id,churchName:c.name,branchId:'',branchName:'',isPrimary:c===mapped[0],sourceCommunityId:sourceCommunities.find(k=>coreCommunityMapping[k]?.id===c.id)});membershipCounts[c.id]=(membershipCounts[c.id]||0)+1;}
    if(!state.profiles.some(p=>String(p.userId)===String(id)))state.profiles.push({userId:id,telephoneNumber:phone,email:record.email||null,idNumber:'',address:'',city:'',postalCode:'',emergencyContactName:'',emergencyContactNumber:''});
  }
  state.demoUsersDisabled=true;
  state.coreImport={source:'duranki-core',importedAt:new Date().toISOString(),sourceUserCount:source.users.length,sourceUserMap:sourceMap};
  return {state,report:{sourceUsers:source.users.length,removedDemoIds:[...removedIds],preservedLocalIds:original.users.filter(u=>!removedIds.has(String(u.id))).map(u=>u.id),superuserId:admin.id,totalUsers:state.users.length,importedActiveMembers:state.users.filter(u=>u.importSource==='duranki-core'&&u.status==='active').length,importedInactiveMembers:state.users.filter(u=>u.importSource==='duranki-core'&&u.status!=='active').length,membershipCounts,review}};
}

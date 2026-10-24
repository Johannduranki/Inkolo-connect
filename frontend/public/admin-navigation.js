export function buildAdminDestinations(roles, tenants, communities, services = []) {
  if (!roles.some(role => ['Platform Admin', 'DURANKI_ADMIN'].includes(role))) return [];
  const base = '/dashboard/platform-admin';
  const groups = [
    {label:'Administration',items:[['Duranki Platform',base],['Tenant & Community Logos','/dashboard/branding'],['Service pricing','/dashboard/service-pricing'],['User directory','/dashboard/users'],['Accounting','/dashboard/accounting'],['Treasury','/dashboard/treasury'],['Cycle Pay','/dashboard/cycle']]},
    {label:'Reports',items:[['Community reports','/dashboard/community-reports']]},
    {label:'Trader Connect',items:[['Training & grant configuration','/dashboard/trader-training']]},
    {label:'Tenants',items:tenants.map(t=>[t.name,`${base}?tenantId=${encodeURIComponent(t.id)}`])},
    {label:'Communities',items:communities.map(c=>[`${tenants.find(t=>t.id===c.tenantId)?.name || c.tenantName || 'Tenant'} - ${c.name}`,`${base}?communityId=${encodeURIComponent(c.platformCommunityId || c.id)}`])},
    {label:'Service dashboards',items:services.filter(s=>/^\/dashboard\/[a-z0-9/-]+$/i.test(s.dashboardRoute || '')).map(s=>[s.name + (s.dashboardRoute.startsWith('/dashboard/services/') && !['/dashboard/services/trader-training','/dashboard/services/grant-distribution'].includes(s.dashboardRoute) ? ' (not connected)' : ''),s.dashboardRoute])}
  ];
  return groups.filter(g=>g.items.length);
}

export function attachPlatformReturnLink(header, roles, pathname, doc = document) {
  const existing = doc.querySelector('[data-platform-admin-return]');
  const allowed = roles.some(role => ['Platform Admin', 'DURANKI_ADMIN'].includes(role));
  if (!allowed || pathname === '/login' || pathname === '/dashboard/platform-admin') {
    existing?.remove();
    return;
  }
  if (!header || existing) return;
  const link = doc.createElement('a');
  link.dataset.platformAdminReturn = 'true';
  link.href = '/dashboard/platform-admin';
  link.textContent = 'Platform Admin';
  link.setAttribute('aria-label', 'Return to Duranki Platform Admin dashboard');
  link.style.cssText = 'display:inline-flex;align-items:center;padding:10px 14px;border:1px solid #b7cbd5;border-radius:6px;background:#fff;color:#12385f;font-weight:700;text-decoration:none;flex-shrink:0;margin:4px';
  header.append(link);
}

export function attachPageLocation(groups = [], doc = document, currentLocation = location) {
  const header=doc.querySelector('header');if(!header)return;
  const names={'/dashboard/platform-admin':'Platform administration','/dashboard/member':'Member dashboard','/dashboard/tenant':'Tenant workspace','/dashboard/service-pricing':'Service configuration','/dashboard/wholesaler-orders':'Wholesaler Orders','/dashboard/community-reports':'Community reports','/dashboard/branding':'Tenant and community branding','/dashboard/users':'User directory','/dashboard/trader-training':'Trader Training','/dashboard/treasury':'Treasury','/dashboard/accounting':'Accounting','/dashboard/cycle':'Cycle Pay','/payments/cycle':'My payments','/dashboard/heritage':'Heritage','/community':'My community','/login':'Sign in / Register','/two-factor':'Two-step verification'};
  const path=currentLocation.pathname,params=new URLSearchParams(currentLocation.search);
  const title=names[path]||doc.querySelector('main h1, h1')?.textContent.trim()||path.split('/').filter(Boolean).pop()?.replaceAll('-',' ')||'Duranki';
  const selected=(id)=>{const control=doc.getElementById(id);return control?.tagName==='SELECT'&&control.value?{id:control.value,name:control.selectedOptions[0]?.textContent.trim()}:null;};
  const directoryName=(group,key,id)=>groups.find(g=>g.label===group)?.items.find(([,url])=>new URL(url,'http://local').searchParams.get(key)===id)?.[0];
  const tenant=selected('tenant'),community=selected('community');
  const tenantId=tenant?.id||params.get('tenantId'),communityId=community?.id||params.get('communityId');
  const details=[];
  if(tenantId)details.push('Tenant: '+(tenant?.name||directoryName('Tenants','tenantId',tenantId)||tenantId));
  if(communityId)details.push('Community: '+(community?.name||directoryName('Communities','communityId',communityId)||communityId));
  if(path==='/dashboard/service-pricing'&&!tenantId&&!communityId)details.push('Duranki defaults');
  const active=doc.querySelector('#tenant-tabs [aria-current="true"]')?.textContent.trim();if(active)details.push(active);
  let strip=doc.getElementById('duranki-page-location');
  if(!strip){strip=doc.createElement('section');strip.id='duranki-page-location';strip.setAttribute('aria-label','Current page and workspace');header.after(strip);}
  const signature=JSON.stringify([title,details]);if(strip.dataset.location===signature)return;
  strip.dataset.location=signature;
  const label=doc.createElement('span');label.className='location-label';label.textContent='You are here';
  const heading=doc.createElement('strong');heading.textContent=title;
  const context=doc.createElement('span');context.className='location-context';context.textContent=details.join(' / ');
  strip.replaceChildren(label,heading,context);
}

if (typeof document !== 'undefined') {
  const style=document.createElement('style');
  style.textContent=`
    #duranki-page-location{box-sizing:border-box;display:flex;align-items:center;flex-wrap:wrap;gap:8px 16px;width:100%;margin:0;padding:14px 24px;border:0;border-bottom:1px solid #c9dadd;border-radius:0;background:#edf5f6;color:#173b47;font:14px/1.5 'Segoe UI',Arial,sans-serif;letter-spacing:0}
    #duranki-page-location .location-label{font-size:12px;color:#42616b}
    #duranki-page-location strong{font-size:16px;overflow-wrap:anywhere;min-width:0}
    #duranki-page-location .location-context{flex:1 1 260px;min-width:0;overflow-wrap:anywhere}
    @media(max-width:600px){#duranki-page-location{padding:12px 16px;gap:6px 12px}#duranki-page-location .location-context{flex-basis:100%}}
    [data-admin-shortcuts]{box-sizing:border-box;width:min(calc(100% - 2rem),84rem);margin:20px auto;padding:20px 0;border-block:1px solid #c8ded6;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}
    [data-admin-shortcuts]>div{min-width:0}
    [data-admin-shortcuts] label{display:grid;gap:8px;font-weight:600;line-height:1.4}
    [data-admin-shortcuts] select{box-sizing:border-box;width:100%;min-width:0;min-height:44px;padding:10px 12px;border:1px solid #b7cbd5;border-radius:6px;background:#fff;color:#173847}
    [data-admin-shortcuts] .shortcut-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px 20px;margin-top:8px}
    [data-admin-shortcuts] a{display:inline-flex;align-items:center;min-height:36px;font-weight:600;color:#135d53;overflow-wrap:anywhere}
    @media(max-width:700px){[data-admin-shortcuts]{grid-template-columns:1fr;gap:20px}}
  `;
  document.head.append(style);
  let token='',groups=[],verifiedRoles=[],pending=false,lastCheck=0;
  const read=key=>{try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value:[];}catch{return [];}};
  const remove=()=>{document.querySelectorAll('[data-admin-destinations]').forEach(n=>n.remove());document.querySelector('[data-admin-workspace]')?.remove();document.querySelector('[data-admin-shortcuts]')?.remove();document.querySelector('[data-admin-membership-exemption]')?.remove();};
  const attachShortcuts=()=>{
    if(location.pathname!=='/dashboard/platform-admin'||document.querySelector('[data-admin-shortcuts]'))return;
    const summary=document.querySelector('.summary-grid');if(!summary)return;
    const section=document.createElement('section');section.dataset.adminShortcuts='true';section.setAttribute('aria-label','Open tenant and community admin dashboards');
    for(const [groupName,title] of [['Tenants','Tenant Admin Dashboard'],['Communities','Community Admin Dashboard']]){
      const group=groups.find(g=>g.label===groupName);if(!group?.items.length)continue;
      const field=document.createElement('div'),label=document.createElement('label'),select=document.createElement('select'),link=document.createElement('a');
      label.textContent=title;
      for(const [name,url]of group.items){const option=document.createElement('option');option.textContent=name;option.value=url;select.append(option);}
      const current=group.items.find(([,url])=>url===location.pathname+location.search);if(current)select.value=current[1];
      link.href=select.value;link.textContent='Open '+title;
      select.addEventListener('change',()=>{link.href=select.value;});
      const actions=document.createElement('div');actions.className='shortcut-actions';
      label.append(select);actions.append(link);field.append(label,actions);section.append(field);
      if(groupName==='Tenants'){
        const staffLink=document.createElement('a');staffLink.textContent='Users & Permissions';
        const staffUrl=()=>'/dashboard/tenant?tenantId='+encodeURIComponent(new URL(select.value,location.origin).searchParams.get('tenantId'));
        staffLink.href=staffUrl();select.addEventListener('change',()=>{staffLink.href=staffUrl();});
        staffLink.addEventListener('click',async event=>{
          event.preventDefault();const tenantId=new URL(select.value,location.origin).searchParams.get('tenantId');
          const name=select.selectedOptions[0]?.textContent;
          try{const response=await fetch('/api/tenant-access',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({id:tenantId,name})});if(!response.ok){const result=await response.json();throw new Error(result.message||'Tenant workspace unavailable.');}location.assign('/dashboard/tenant?tenantId='+encodeURIComponent(tenantId));}catch(error){staffLink.textContent=error.message;}
        });actions.append(staffLink);
      }
    }
    summary.after(section);
  };
  const attach=()=>{
    attachPageLocation(groups);
    if(verifiedRoles.some(role=>['Platform Admin','DURANKI_ADMIN'].includes(role))&&location.pathname==='/dashboard/platform-admin'){
      const nav=document.querySelector('nav');
      if(nav&&!nav.querySelector('[data-branding-link]')){const link=document.createElement('a');link.dataset.brandingLink='true';link.href='/dashboard/branding';link.textContent='Tenant & Community Logos';nav.append(link);}
      for(const label of document.querySelectorAll('label'))if(/^(Tenant|Community) logo URL/.test(label.textContent.trim())&&!label.querySelector('[data-upload-logo]')){const link=document.createElement('a');link.dataset.uploadLogo='true';link.href='/dashboard/branding'+location.search;link.textContent='Upload logo';label.append(link);}
      if(nav&&!nav.querySelector('[data-pricing-link]')){const link=document.createElement('a');link.dataset.pricingLink='true';link.href='/dashboard/service-pricing';link.textContent='Service pricing';nav.append(link);}
      const legacyPrice=document.querySelector('input[placeholder="Service price"]');
      if(legacyPrice){legacyPrice.disabled=true;legacyPrice.style.setProperty('display','none','important');if(!legacyPrice.parentElement.querySelector('[data-central-pricing]')){const link=document.createElement('a');link.dataset.centralPricing='true';link.href='/dashboard/service-pricing';link.textContent='Configure service pricing';legacyPrice.after(link);}}
    }
    attachPlatformReturnLink(document.querySelector('header'), verifiedRoles, location.pathname);
    if(!groups.length || location.pathname==='/login') {remove();return;}
    if(['/community','/dashboard/member'].includes(location.pathname)){
      const main=document.querySelector('main');
      if(verifiedRoles.some(role=>['Platform Admin','DURANKI_ADMIN'].includes(role))){
        const communityId=new URLSearchParams(location.search).get('communityId');
        for(const heading of document.querySelectorAll('article h3')){
          if(heading.textContent.trim()!=='Community Membership')continue;
          const card=heading.closest('article');
          for(const button of card.querySelectorAll('button')){button.hidden=true;button.style.setProperty('display','none','important');}
          let entry=card.querySelector('[data-membership-admin-entry]');
          if(!entry){
            entry=document.createElement('a');entry.dataset.membershipAdminEntry='true';
            entry.textContent='Open community';
            entry.style.cssText='display:inline-flex;align-items:center;min-height:44px;font-weight:700';
            const note=document.createElement('p');note.textContent='Admin testing access - no membership payment required.';
            card.append(note,entry);
          }
          entry.href='/community'+(communityId?'?communityId='+encodeURIComponent(communityId):'');
        }
      }
      if(main&&!document.querySelector('[data-admin-membership-exemption]')){
        const note=document.createElement('p');note.dataset.adminMembershipExemption='true';note.setAttribute('role','status');
        note.textContent='Platform admin testing access: community membership fee exempt. No payment recorded.';
        note.style.cssText='padding:12px 0;color:#135d53;font-weight:600';main.prepend(note);
      }
    }else document.querySelector('[data-admin-membership-exemption]')?.remove();
    attachShortcuts();
    let select=document.querySelector('app-role-switcher select');
    if(select) document.querySelector('[data-admin-workspace]')?.remove();
    if(!select){
      const header=document.querySelector('header');if(!header)return;
      select=header.querySelector('[data-admin-workspace] select');
      if(!select){const label=document.createElement('label');label.dataset.adminWorkspace='true';label.textContent='Admin workspace ';select=document.createElement('select');select.setAttribute('aria-label','Admin workspace');const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Open workspace';select.append(placeholder);label.append(select);header.append(label);}
    }
    if(select.querySelector('[data-admin-destinations]'))return;
    for(const group of groups){const optgroup=document.createElement('optgroup');optgroup.label=group.label;optgroup.dataset.adminDestinations='true';for(const [name,url]of group.items){const option=document.createElement('option');option.value='admin:'+url;option.textContent=name;optgroup.append(option);}select.append(optgroup);}
    if(!select.dataset.adminNavigationBound){
      select.dataset.adminNavigationBound='true';
      select.addEventListener('change',event=>{
        if(!select.value.startsWith('admin:'))return;
        const destination=select.value.slice(6);
        if(!groups.some(g=>g.items.some(([,url])=>url===destination)))return;
        event.stopImmediatePropagation();event.preventDefault();location.assign(destination);
      },true);
    }
  };
  async function refresh(){
    const current=sessionStorage.getItem('duranki_access_token')||localStorage.getItem('duranki_access_token')||'';
    if(current!==token){token=current;groups=[];verifiedRoles=[];lastCheck=0;remove();attachPlatformReturnLink(null,[],location.pathname);}
    if(!token||location.pathname==='/login'){groups=[];verifiedRoles=[];remove();attachPlatformReturnLink(null,[],location.pathname);return;}
    if(pending||Date.now()-lastCheck<30000){attach();return;}
    pending=true;lastCheck=Date.now();const active=token;let roleVerified=false;
    try{
      const headers={Authorization:'Bearer '+active};
      const response=await fetch('/api/platform/roles',{headers,cache:'no-store'});
      if(!response.ok)throw new Error('Role verification failed');
      const roles=await response.json();
      if(active!==token)return;
      verifiedRoles=roles;
      roleVerified=true;
      attachPlatformReturnLink(document.querySelector('header'),verifiedRoles,location.pathname);
      if(!roles.some(r=>['Platform Admin','DURANKI_ADMIN'].includes(r))){groups=[];remove();return;}
      groups=buildAdminDestinations(roles,[],[]);remove();attach();
      const directory=await fetch('/api/platform/admin/import-directory',{headers,cache:'no-store'});
      if(!directory.ok)throw new Error('Directory unavailable');
      const data=await directory.json();
      const tenants=new Map(read('duranki_platform_tenants').filter(t=>t.id!=='tenant-evolve').map(t=>[t.id,t]));
      const communities=new Map((data.communities||[]).map(c=>[c.platformCommunityId||c.id,c]));
      const removed=new Set(['community-inkolo-kzn','community-inkolo-gauteng','community-asmara','community-eritrea','community-trader-ethekwini-central','community-trader-kwamashu','community-trader-umlazi','community-trader-pinetown']);
      for(const c of read('duranki_platform_communities'))if(!removed.has(c.id)&&c.tenantId!=='tenant-evolve'&&!communities.has(c.id))communities.set(c.id,c);
      for(const c of communities.values())if(!tenants.has(c.tenantId))tenants.set(c.tenantId,{id:c.tenantId,name:c.tenantName||c.tenantId});
      if(active!==token)return;
      groups=buildAdminDestinations(roles,[...tenants.values()],[...communities.values()],read('duranki_platform_services'));remove();attach();
    }catch{if(active===token){if(!roleVerified)verifiedRoles=[];groups=buildAdminDestinations(verifiedRoles,[],[]);remove();attach();}}finally{pending=false;}
  }
  new MutationObserver(attach).observe(document.body,{subtree:true,childList:true});
  document.addEventListener('change',()=>attachPageLocation(groups));
  document.addEventListener('click',()=>queueMicrotask(()=>attachPageLocation(groups)));
  window.addEventListener('popstate',()=>attachPageLocation(groups));
  setInterval(refresh,5000);window.addEventListener('storage',()=>{lastCheck=0;refresh();});refresh();
}

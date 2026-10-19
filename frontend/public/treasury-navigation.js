// Compatibility navigation while the restored Angular source and deployed bundle are reconciled.
(() => {
  if (!document.querySelector('script[data-presence-client]')) {
    const presence = document.createElement('script');
    presence.dataset.presenceClient = 'true'; presence.src = '/presence.js';
    document.head.append(presence);
  }
  const realDataStyle = document.createElement('style');
  realDataStyle.textContent = '.online-speedometer-panel{display:none!important}';
  document.head.append(realDataStyle);
  // The legacy bundle lacks the Angular form directive on the tenant form.
  document.addEventListener('submit',event=>{
    if(!location.pathname.startsWith('/dashboard/platform-admin'))return;
    const form=event.target;
    if(!(form instanceof HTMLFormElement)||!['Create New Tenant','Update Tenant'].includes(form.querySelector('button[type="submit"]')?.textContent.trim()))return;
    if(event.defaultPrevented)return;
    event.preventDefault();form.dispatchEvent(new Event('ngSubmit'));
  });
  let heritage=null,lastToken='',pending=false,lastCheck=0;
  const heritagePanel=()=>{
    const token=sessionStorage.getItem('duranki_access_token')||localStorage.getItem('duranki_access_token')||'';
    if(token!==lastToken){lastToken=token;heritage=null;lastCheck=0;document.querySelector('[data-heritage-services]')?.remove();}
    if(!token||location.pathname==='/login'){document.querySelector('[data-heritage-services]')?.remove();return;}
    if(!pending&&Date.now()-lastCheck>30000){pending=true;lastCheck=Date.now();fetch('/api/heritage/access',{headers:{Authorization:'Bearer '+token},cache:'no-store'}).then(r=>r.ok?r.json():null).then(result=>{if(lastToken===token){heritage=result;document.querySelector('[data-heritage-services]')?.remove();}}).catch(()=>{}).finally(()=>{pending=false;attach();});}
    if(!heritage||document.querySelector('[data-heritage-services]'))return;
    const platform=location.pathname.startsWith('/dashboard/platform-admin');
    if(!platform&&!['/community','/dashboard/member'].includes(location.pathname))return;
    const requested=new URLSearchParams(location.search).get('communityId');
    const scopes=heritage.scopes.filter(s=>s.enabled&&s.tenant_enabled&&(!requested||requested===s.community_id));
    if(!scopes.length&&!(platform&&heritage.platform))return;
    const host=platform
      ? document.querySelector('input[placeholder="New service name"]')?.closest('article') || document.querySelector('.service-management')?.parentElement
      : document.querySelector('.services-section .service-grid') || document.querySelector('.community-active-content');
    if(!host)return;
    const section=document.createElement(platform?'div':'article');section.dataset.heritageServices='true';section.setAttribute('aria-label','Duranki Heritage / Family Tree service');section.style.cssText='padding:16px 0;color:#163e36';
    if(!platform)section.className='service-card';
    const label=document.createElement('strong');label.textContent='Duranki Heritage / Family Tree';section.append(label);
    if(platform&&heritage.platform){const row=document.createElement('p'),link=document.createElement('a');link.href='/dashboard/heritage';link.textContent='Configure service availability';row.append(link);section.append(row);}
    for(const scope of scopes){const row=document.createElement('p'),link=document.createElement('a');const subscribed=heritage.subscriptions.some(s=>s.communityId===scope.community_id&&s.status==='active');if(location.pathname==='/community'&&!subscribed)continue;link.href='/dashboard/heritage?communityId='+encodeURIComponent(scope.community_id);link.textContent=scope.name+' - '+(subscribed?'Open my family tree':'Join Heritage')+' (R0/month)';row.append(link);section.append(row);}
    if(heritage.invitations.length){const row=document.createElement('p');row.textContent=heritage.invitations.length+' family invitation(s) awaiting your response.';section.append(row);}
    if(!platform&&location.pathname==='/community'&&!section.querySelector('a'))return;
    host.append(section);
  };
  const attach=()=>{
    heritagePanel();
    const summary=location.pathname.startsWith('/dashboard/platform-admin')&&document.querySelector('.summary-grid');
    if(summary&&!document.querySelector('[data-real-data-notice]')){
      const note=document.createElement('p');note.dataset.realDataNotice='true';
      note.textContent='Financial totals require reconciled transaction data.';
      summary.after(note);
    }
    if(!location.pathname.startsWith('/dashboard/platform-admin'))return;
    const nav=document.querySelector('nav[aria-label="Platform navigation"]') || document.querySelector('header nav');
    if(nav&&!nav.querySelector('[data-treasury]')){const a=document.createElement('a');a.href='/dashboard/treasury';a.textContent='Treasury';a.dataset.treasury='true';a.style.cssText='padding:12px;color:#155b4c;font-weight:bold';nav.append(a);}
    if(nav&&!nav.querySelector('[data-cycle-admin]')){const a=document.createElement('a');a.href='/dashboard/cycle';a.textContent='Cycle Pay';a.dataset.cycleAdmin='true';a.style.cssText='padding:12px;color:#155b4c;font-weight:bold';nav.append(a);}
    if(nav&&!nav.querySelector('[data-users]')){const a=document.createElement('a');a.href='/dashboard/users';a.textContent='User directory';a.dataset.users='true';a.style.cssText='padding:12px;color:#155b4c;font-weight:bold';nav.append(a);}
  };
  new MutationObserver(attach).observe(document.body,{childList:true,subtree:true});attach();
  setInterval(attach,30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){lastCheck=0;attach();}});
})();

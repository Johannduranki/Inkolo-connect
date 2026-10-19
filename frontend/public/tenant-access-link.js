(() => {
  let checked='',allowed=false;
  async function refresh(){
    const token=sessionStorage.getItem('duranki_access_token')||localStorage.getItem('duranki_access_token')||'';
    if(token!==checked){checked=token;allowed=false;document.querySelector('[data-tenant-workspace]')?.remove();}
    if(!token||location.pathname==='/login')return;
    try{
      const response=await fetch('/api/tenant-access',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
      allowed=response.ok&&(await response.json()).length>0;
    }catch{allowed=false;}
    if(token!==checked)return;
    const header=document.querySelector('header');
    if(!allowed){document.querySelector('[data-tenant-workspace]')?.remove();return;}
    if(header&&!document.querySelector('[data-tenant-workspace]')){
      const a=document.createElement('a');a.dataset.tenantWorkspace='true';a.href='/dashboard/tenant';a.textContent='Tenant workspace';a.style.cssText='margin:4px;padding:10px;color:#12385f;font-weight:600';header.append(a);
    }
  }
  refresh();setInterval(refresh,15000);
})();

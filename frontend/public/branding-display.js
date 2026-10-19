(()=>{
  let rows=[],token='',loadedAt=0,pending=false;
  function render(){
    const params=new URLSearchParams(location.search),community=params.get('communityId'),tenant=params.get('tenantId');
    const row=community?rows.find(r=>r.kind==='community'&&(r.id===community||r.aliases?.includes(community))):rows.find(r=>r.kind==='tenant'&&r.id===tenant);
    const header=document.querySelector('header');let logo=document.querySelector('[data-entity-logo]');
    const original=document.querySelector('header .community-brand-logo');
    if(!row?.logoUrl||!header||location.pathname==='/login'){logo?.remove();if(original)original.hidden=false;return;}
    if(original)original.hidden=true;
    if(!logo){logo=document.createElement('img');logo.dataset.entityLogo='true';logo.style.cssText='width:80px;height:64px;object-fit:contain;background:white;border-radius:4px;flex-shrink:0';header.append(logo);}
    if(logo.getAttribute('src')!==row.logoUrl)logo.src=row.logoUrl;
    logo.alt=row.name+' logo';
  }
  async function refresh(){const active=sessionStorage.getItem('duranki_access_token')||localStorage.getItem('duranki_access_token')||'';if(active!==token){token=active;rows=[];loadedAt=0;}render();if(!token||pending||Date.now()-loadedAt<30000)return;pending=true;const requestToken=token;try{const response=await fetch('/api/branding',{headers:{Authorization:'Bearer '+token},cache:'no-store'});if(response.ok&&token===requestToken)rows=await response.json();else rows=[];loadedAt=Date.now();}catch{rows=[];}finally{pending=false;render();}}
  new MutationObserver(render).observe(document.body,{childList:true,subtree:true});setInterval(refresh,5000);refresh();
})();

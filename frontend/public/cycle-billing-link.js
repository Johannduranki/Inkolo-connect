(() => {
  function render(){
    if(!location.pathname.startsWith('/dashboard/'))return;
    const header=document.querySelector('header');if(!header||header.querySelector('[data-cycle-payments]'))return;
    const link=document.createElement('a');link.dataset.cyclePayments='true';link.textContent='My payments';link.href='/payments/cycle'+location.search;header.append(link);
    if(location.pathname==='/dashboard/platform-admin'){
      const button=document.createElement('button');button.type='button';button.textContent='Publish payment availability';button.title='Save enabled tenant and community services for server-side payment validation';
      button.onclick=async()=>{button.disabled=true;try{
        const tenants=JSON.parse(localStorage.getItem('duranki_platform_tenants')||'[]'),communities=JSON.parse(localStorage.getItem('duranki_platform_communities')||'[]');
        if(!tenants.length||!communities.length)throw Error('Load the tenant and community configuration first.');
        const token=sessionStorage.getItem('duranki_access_token')||localStorage.getItem('duranki_access_token')||'';
        const response=await fetch('/api/cycle/availability',{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({tenants,communities})});const data=await response.json();if(!response.ok)throw Error(data.message||'Could not publish availability.');button.textContent='Payment availability published';
      }catch(e){button.textContent=e.message;}finally{button.disabled=false;}};header.append(button);
    }
  }
  new MutationObserver(render).observe(document.body,{childList:true,subtree:true});render();
})();

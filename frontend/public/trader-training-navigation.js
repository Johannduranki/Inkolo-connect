(()=>{
  // Supersede legacy browser-only grant controls; funding is now server-authorized.
  const style=document.createElement('style');style.textContent='.platform-page .grant-panel,.platform-page .training-panel{display:none!important}';document.head.append(style);
  let identity='',allowed=false,pending=false,last=0;
  function render(){
    const existing=document.querySelector('[data-trader-training-link]');
    if(!allowed||!['/dashboard/member','/dashboard/platform-admin','/dashboard/tenant'].includes(location.pathname)){existing?.remove();return;}
    const header=document.querySelector('header');if(!header||existing)return;
    const link=document.createElement('a');link.dataset.traderTrainingLink='true';link.href='/dashboard/trader-training';link.textContent='Trader training & grants';link.style.cssText='display:inline-flex;align-items:center;min-height:42px;padding:8px 12px;color:#00778d;background:#fff;border:1px solid #b5c8d3;border-radius:5px;font:600 14px Segoe UI,Arial,sans-serif;text-decoration:none';header.append(link);
  }
  async function check(){const token=sessionStorage.getItem('duranki_access_token')||localStorage.getItem('duranki_access_token')||'';if(token!==identity){identity=token;allowed=false;last=0;render();}if(!token||pending||Date.now()-last<30000){render();return;}pending=true;last=Date.now();try{const response=await fetch('/api/trader-training/study/access',{headers:{Authorization:'Bearer '+token},cache:'no-store'});const data=response.ok?await response.json():null;if(token===identity)allowed=!!data?.tenants?.length;}catch{allowed=false;}finally{pending=false;render();}}
  new MutationObserver(render).observe(document.body,{childList:true,subtree:true});setInterval(check,3000);check();
})();

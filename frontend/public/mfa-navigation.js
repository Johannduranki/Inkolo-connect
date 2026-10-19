// Compatibility bridge for the deployed Angular bundle; authorisation is enforced by the API.
(() => {
  const landingKey='duranki_login_landing_pending';
  document.addEventListener('submit',()=>{if(location.pathname==='/login'){sessionStorage.setItem(landingKey,'1');previous=undefined;lastChecked=0;}},true);
  // Login now handles MFA responses directly; this only migrates older sessions.
  let previous,lastChecked=0,pending=false;
  const check=async()=>{
    if(location.pathname==='/two-factor')return;
    const token=sessionStorage.getItem('duranki_access_token')||localStorage.getItem('duranki_access_token');
    if(!token||pending||(token===previous&&Date.now()-lastChecked<60000))return;
    previous=token;lastChecked=Date.now();pending=true;
    try{
      const response=await fetch('/api/auth/mfa/status',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
      const current=sessionStorage.getItem('duranki_access_token')||localStorage.getItem('duranki_access_token');
      // An old in-flight check must not erase a newer login or MFA challenge.
      if(current!==token||sessionStorage.getItem('duranki_mfa_challenge'))return;
      if(response.status===401){sessionStorage.removeItem('duranki_access_token');localStorage.removeItem('duranki_access_token');location.replace('/login');return;}
      if(!response.ok)return;
      const status=await response.json();
      if((sessionStorage.getItem('duranki_access_token')||localStorage.getItem('duranki_access_token'))!==token||sessionStorage.getItem('duranki_mfa_challenge'))return;
      if(status.challenge){sessionStorage.setItem('duranki_mfa_challenge',token);sessionStorage.removeItem('duranki_access_token');localStorage.removeItem('duranki_access_token');location.replace('/two-factor');return;}
      if(status.required&&!status.verified){sessionStorage.removeItem('duranki_access_token');localStorage.removeItem('duranki_access_token');location.replace('/login');return;}
      if(sessionStorage.getItem(landingKey)==='1'){
        const profileResponse=await fetch('/api/auth/me',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
        if(!profileResponse.ok)return;
        const user=await profileResponse.json();
        if((sessionStorage.getItem('duranki_access_token')||localStorage.getItem('duranki_access_token'))!==token)return;
        sessionStorage.removeItem(landingKey);
        if(user.roles?.includes('Platform Admin')){
          localStorage.setItem('duranki_active_role_'+user.id,'Platform Admin');
          if(location.pathname!=='/dashboard/platform-admin')location.replace('/dashboard/platform-admin');
        }
      }
    }catch{/* Keep the session during temporary network failures; retry after the interval. */}
    finally{pending=false;}
  };
  check();setInterval(check,750);
})();

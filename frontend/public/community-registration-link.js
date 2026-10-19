(() => {
  let timer, pending, lastKey = '', registeredPhone = '', existingLoginPhone = '';
  const normalize = value => {
    const digits = value.replace(/[\s()+-]/g,'');
    return /^27\d{9}$/.test(digits) ? '0'+digits.slice(2) : digits;
  };
  function registrationInput() {
    if(location.pathname !== '/login')return null;
    const register = [...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Register');
    if(!register?.classList.contains('active'))return null;
    return document.getElementById('telephoneNumber');
  }
  function useExistingAccount(input) {
    existingLoginPhone = normalize(input.value);
    sessionStorage.setItem('duranki_join_after_login','true');
    const login = [...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Member login');
    if (!login) { location.assign('/join-community'); return; }
    // Switch Angular's actual form mode so first-registration validators no longer apply.
    login.click();
    document.querySelector('input[type="password"]')?.focus();
  }
  function existingLoginNotice() {
    const input = document.getElementById('telephoneNumber');
    const show = location.pathname === '/login' && !registrationInput() && input &&
      existingLoginPhone && normalize(input.value) === existingLoginPhone;
    let panel = document.querySelector('[data-existing-login]');
    if (!show) { panel?.remove(); return; }
    if (panel) return;
    panel = document.createElement('section'); panel.dataset.existingLogin = 'true';
    panel.setAttribute('role','status');
    panel.style.cssText='margin:12px 0;padding:16px;border:1px solid #aad7df;border-radius:6px;background:#f0f9fb;color:#173b4b;line-height:1.6';
    panel.textContent='You are already registered. No need to enter your personal details again. Sign in below to view your existing roles and choose a community. Your current memberships will be kept.';
    input.after(panel);
  }
  function notice(input, message, existing = false) {
    let panel = document.querySelector('[data-registration-check]');
    if(!panel){panel=document.createElement('section');panel.dataset.registrationCheck='true';panel.setAttribute('aria-live','polite');panel.style.cssText='margin:12px 0;padding:16px;border:1px solid #aad7df;border-radius:6px;background:#f0f9fb;color:#173b4b';input.after(panel);}
    panel.replaceChildren();
    const text=document.createElement('p');text.textContent=message;text.style.margin='0';panel.append(text);
    if(existing){
      const hint=document.createElement('p');hint.textContent='Sign in with your existing password to view your roles and choose a community. Your account and existing memberships will be kept.';panel.append(hint);
      const button=document.createElement('button');button.type='button';button.textContent='Sign in and choose a community';
      button.style.cssText='min-height:44px;padding:10px 16px;border:0;border-radius:6px;background:#007c94;color:white;font:600 14px/1.4 Segoe UI,sans-serif;cursor:pointer;max-width:100%;white-space:normal';
      button.onclick=()=>useExistingAccount(input);panel.append(button);
    }
  }
  function checkNumber() {
    const input=registrationInput(),phone=input?normalize(input.value):'';
    const key=input?'register:'+phone:'';
    if(key===lastKey)return;
    lastKey=key;registeredPhone='';clearTimeout(timer);pending?.abort();pending=null;
    document.querySelector('[data-registration-check]')?.remove();
    if(!input||!/^0\d{9}$/.test(phone))return;
    timer=setTimeout(async()=>{
      const controller=new AbortController();pending=controller;
      notice(input,'Checking your telephone number...');
      try{
        const response=await fetch('/api/auth/registration-check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({telephoneNumber:phone}),cache:'no-store',signal:controller.signal});
        const data=await response.json();
        if(controller.signal.aborted||lastKey!==key||registrationInput()!==input)return;
        if(!response.ok)throw Error(data.message||'Could not check your number. You can still continue registration.');
        if(data.registered){registeredPhone=phone;useExistingAccount(input);}
        else notice(input,'No existing account found. Continue creating your account.');
      }catch(error){if(error.name!=='AbortError'&&lastKey===key)notice(input,error.message);}
    },450);
  }
  document.addEventListener('input',event=>{if(event.target.id==='telephoneNumber'){checkNumber();existingLoginNotice();}});
  document.addEventListener('submit',event=>{
    const input=registrationInput();
    if(input&&event.target.contains(input)&&registeredPhone===normalize(input.value)){
      event.preventDefault();event.stopImmediatePropagation();
      notice(input,'You are already registered. Do you want to register as a community member?',true);
      document.querySelector('[data-registration-check]')?.scrollIntoView({block:'nearest'});
    }
  },true);
  function render() {
    checkNumber();
    existingLoginNotice();
    if (location.pathname === '/two-factor' || location.pathname === '/join-community') return;
    const header = document.querySelector('header');
    if (header && !header.querySelector('[data-join-community]')) {
      const link = document.createElement('a'); link.dataset.joinCommunity = 'true';
      link.href = '/join-community'; link.textContent = 'Join a community';
      link.style.cssText = 'display:inline-block;padding:10px 14px;font:600 14px/1.4 Segoe UI,sans-serif;color:inherit'; header.append(link);
    }
    if (location.pathname === '/login') {
      const error = [...document.querySelectorAll('p')].find(p => !p.closest('[data-registration-check]') && /already registered/i.test(p.textContent));
      if (error && !document.querySelector('[data-existing-community]')) {
        const link = document.createElement('a'); link.dataset.existingCommunity = 'true';
        link.href = '/join-community'; link.textContent = 'Register as a community member'; error.after(link);
      } else if (!error) document.querySelector('[data-existing-community]')?.remove();
    }
    if (sessionStorage.getItem('duranki_join_after_login') === 'true' && (location.pathname.startsWith('/dashboard/') || location.pathname === '/community')) location.replace('/join-community');
  }
  new MutationObserver(render).observe(document.body,{childList:true,subtree:true}); render();
})();

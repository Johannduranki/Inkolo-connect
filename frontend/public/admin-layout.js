(()=>{
  if(!document.querySelector('link[href="/admin-layout.css"]')){const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href='/admin-layout.css';document.head.append(sheet);}
  function organize(){
    const themed=location.pathname.startsWith('/dashboard')||location.pathname==='/community'||location.pathname.startsWith('/payments/');
    if(document.body.classList.contains('duranki-dashboard-theme')!==themed)document.body.classList.toggle('duranki-dashboard-theme',themed);
    const page=document.querySelector('.platform-page');if(!page)return;
    const header=page.querySelector('.topbar'),nav=header?.querySelector('nav');
    const workspace=header?.querySelector('[data-tenant-workspace]');if(nav&&workspace&&workspace.parentElement!==nav)nav.append(workspace);
    const hero=page.querySelector('.hero');
    const active=nav?.querySelector('button.active')?.textContent.trim();
    const title=active==='Tenant'?'Tenant administration':active==='Community'?'Community administration':'Platform overview';
    const heading=hero?.querySelector('h1'),eyebrow=hero?.querySelector('p');
    if(heading&&heading.textContent!==title)heading.textContent=title;
    if(eyebrow&&eyebrow.textContent!=='DURANKI NETWORK')eyebrow.textContent='DURANKI NETWORK';
    const editor=page.querySelector('.form-panel'),editorHeading=editor?.querySelector('.heading h2');
    if(editorHeading){const editing=editor.querySelector('.heading p')?.textContent.trim()==='EDIT TENANT';const name=editor.querySelector('input')?.value||'';const label=editing?'Edit tenant: '+name:'Tenant setup';if(editorHeading.textContent!==label)editorHeading.textContent=label;}
  }
  new MutationObserver(organize).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});window.addEventListener('popstate',organize);organize();
})();

(()=>{
 const panel=document.getElementById('tenant-assignments');let revision=0,generation=0;
 const element=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
 async function api(path,body){const token=sessionStorage.getItem('duranki_access_token')||localStorage.getItem('duranki_access_token')||'';const r=await fetch('/api/service-pricing'+path,{method:body?'PUT':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.message||'Assignment access denied.');return data;}
 (async()=>{try{
  const scopes=await api('/scopes');if(!scopes.platform)return;
  const title=element('h2','Assign services to tenants'),label=element('label','Tenant'),select=element('select'),list=element('div'),save=element('button','Save assignments'),status=element('p');
  list.className='assignment-options';status.setAttribute('role','status');select.setAttribute('aria-label','Assignment tenant');save.type='button';label.append(select);
  for(const t of scopes.tenants){const o=element('option',t.name);o.value=t.id;select.append(o);}
  panel.append(title,label,list,save,status);panel.hidden=false;
  async function load(){const ticket=++generation;save.disabled=true;list.replaceChildren();status.textContent='';try{if(!select.value){status.textContent='No tenants available.';return;}const data=await api('/assignments?tenantId='+encodeURIComponent(select.value));if(ticket!==generation)return;revision=data.revision;for(const service of data.services){const row=element('label'),check=element('input');check.type='checkbox';check.value=service.code;check.checked=data.serviceCodes.includes(service.code);row.append(check,document.createTextNode(service.name));list.append(row);}save.disabled=false;}catch(e){if(ticket===generation)status.textContent=e.message;}}
  select.onchange=load;save.onclick=async()=>{save.disabled=true;select.disabled=true;try{await api('/assignments',{tenantId:select.value,revision,serviceCodes:[...list.querySelectorAll('input:checked')].map(i=>i.value)});await load();status.textContent='Assignments saved. Existing subscriptions and records are unchanged.';}catch(e){status.textContent=e.message;}finally{select.disabled=false;save.disabled=false;}};await load();
 }catch{panel.hidden=true;}})();
})();

const $=s=>document.querySelector(s);
let tenants=[],staff=[],labels={},editing=null,generation=0;
const current=()=>tenants.find(t=>t.id===$('#tenant').value);
async function api(path='',method='GET',body){
  const token=sessionStorage.getItem('duranki_access_token')||localStorage.getItem('duranki_access_token')||'';
  const response=await fetch('/api/tenant-access'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const result=await response.json();if(!response.ok)throw new Error(result.message||'Request failed.');return result;
}
function text(tag,value){const node=document.createElement(tag);node.textContent=value;return node;}
async function show(view){
  const ticket=++generation,t=current();if(!t)return;
  for(const name of ['overview','communities','staff']){$('#'+name).hidden=true;$('#'+name+'-tab').setAttribute('aria-current',String(name===view));}
  $('#status').textContent='';
  try{
    if(view==='overview'){$('#tenant-name').textContent=t.name;$('#tenant-id').textContent=t.id;}
    if(view==='communities'){
      const rows=await api('/'+encodeURIComponent(t.id)+'/communities');if(ticket!==generation)return;
      $('#community-list').replaceChildren(...rows.map(c=>text('li',c.name)));if(!rows.length)$('#community-list').append(text('li','No communities registered.'));
    }
    if(view==='staff'){
      const result=await api('/'+encodeURIComponent(t.id)+'/staff');if(ticket!==generation)return;
      staff=result.staff;labels=result.permissions;$('#staff-rows').replaceChildren();
      for(const row of staff){const tr=document.createElement('tr');for(const value of [row.firstName+' '+row.lastName,row.telephoneNumber,row.permissions.map(p=>labels[p]).join(', '),row.status])tr.append(text('td',value));const cell=document.createElement('td'),button=text('button','Edit access');button.onclick=()=>edit(row);cell.append(button);tr.append(cell);$('#staff-rows').append(tr);}
      if(!staff.length){const row=document.createElement('tr'),cell=text('td','No staff assigned to this tenant.');cell.colSpan=5;row.append(cell);$('#staff-rows').append(row);}
    }
    if(ticket===generation&&view)$('#'+view).hidden=false;
  }catch(error){if(ticket===generation)$('#status').textContent=error.message;}
}
function selectTenant(){
  const t=current();if(!t)return;
  $('#service-settings').hidden=!t.permissions.some(p=>['services.manage','users.manage'].includes(p));
  $('#service-settings').href='/dashboard/service-pricing?tenantId='+encodeURIComponent(t.id);
  $('#wholesaler-admin').href='/dashboard/wholesaler-orders?admin=1&tenantId='+encodeURIComponent(t.id);
  $('#community-reports-link').href='/dashboard/community-reports?tenantId='+encodeURIComponent(t.id);
  $('#tenant-branding-link').href='/dashboard/branding?tenantId='+encodeURIComponent(t.id);
  for(const [view,permission]of [['overview','tenant.view'],['communities','communities.view'],['staff','users.manage']])$('#'+view+'-tab').hidden=!t.permissions.includes(permission);
  history.replaceState(null,'','?tenantId='+encodeURIComponent(t.id));
  show(t.permissions.includes('users.manage')?'staff':t.permissions.includes('tenant.view')?'overview':t.permissions.includes('communities.view')?'communities':'');
}
function edit(row){
  editing=row;$('#staff-form').reset();$('#form-status').textContent='';$('#editor-title').textContent=row?'Edit tenant access':'Add tenant user';$('#phone').value=row?.telephoneNumber||'';$('#phone').disabled=!!row;$('#new-fields').hidden=!!row;$('#access-status').value=row?.status||'active';$('#permissions').replaceChildren();
  for(const [key,name]of Object.entries(labels)){if(!current().permissions.includes(key))continue;const label=text('label',name),input=document.createElement('input');input.type='checkbox';input.value=key;input.checked=row?row.permissions.includes(key):key==='tenant.view';label.prepend(input);$('#permissions').append(label);}
  $('#editor').showModal();
}
$('#add').onclick=()=>edit(null);$('#cancel').onclick=()=>$('#editor').close();$('#tenant').onchange=selectTenant;
for(const name of ['overview','communities','staff'])$('#'+name+'-tab').onclick=()=>show(name);
$('#staff-form').onsubmit=async event=>{event.preventDefault();$('#save').disabled=true;$('#form-status').textContent='';try{await api('/'+encodeURIComponent(current().id)+'/staff'+(editing?'/'+encodeURIComponent(editing.id):''),editing?'PUT':'POST',{telephoneNumber:$('#phone').value,firstName:$('#first').value,lastName:$('#last').value,email:$('#email').value,password:$('#password').value,permissions:[...document.querySelectorAll('#permissions input:checked')].map(i=>i.value),status:$('#access-status').value});$('#password').value='';$('#editor').close();await show('staff');}catch(error){$('#form-status').textContent=error.message;}finally{$('#save').disabled=false;}};
(async()=>{try{tenants=await api();for(const tenant of tenants){const option=text('option',tenant.name);option.value=tenant.id;$('#tenant').append(option);}const requested=new URLSearchParams(location.search).get('tenantId');if(requested){$('#tenant').value=requested;if(!tenants.some(t=>t.id===requested))throw new Error('This tenant workspace is not registered or you do not have access. Return to the platform dashboard to register it through Users & Permissions.');}if(!tenants.length){$('#status').textContent='No tenant dashboard access is assigned to your account.';$('nav').hidden=true;return;}selectTenant();}catch(error){$('#status').textContent=error.message;$('nav').hidden=true;}})();

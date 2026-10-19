const $ = selector => document.querySelector(selector);
let state;
const money = value => new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'}).format(value/100);
const token = () => sessionStorage.getItem('duranki_access_token') || localStorage.getItem('duranki_access_token');
async function api(path='', body, raw=false) {
  const response = await fetch('/api/treasury'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+(token()||''),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  if (!response.ok) { if(response.status===401||response.status===403)$('#login-link').hidden=false;const error = await response.json().catch(()=>({})); throw new Error(error.message || 'Treasury request failed. Sign in with an authorised account.'); }
  return raw ? response.blob() : response.json();
}
function report(error) { $('#message').textContent = error.message;const dialog=document.querySelector('dialog[open]');if(dialog){let alert=dialog.querySelector('[role=alert]');if(!alert){alert=document.createElement('p');alert.setAttribute('role','alert');dialog.prepend(alert);}alert.textContent=error.message;} }
function cell(row,value,detail) { const td=document.createElement('td');td.textContent=value??'';if(detail){const s=document.createElement('small');s.textContent=detail;td.append(s);}row.append(td);return td; }
function option(select,value,label){const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o);}
function choices(select,rows,label,blank){const old=select.value;select.replaceChildren();option(select,'',blank);rows.forEach(r=>option(select,r.id,label(r)));select.value=old;}
function empty(tbody,columns){if(!tbody.children.length){const row=tbody.insertRow();const td=row.insertCell();td.colSpan=columns;td.textContent='No records yet.';}}
function action(td,label,fn){const b=document.createElement('button');b.textContent=label;b.onclick=()=>run(fn,b);td.append(b);}
async function run(fn,button){if(button)button.disabled=true;try{await fn();$('#message').textContent='';document.querySelectorAll('dialog [role=alert]').forEach(e=>e.remove());}catch(e){report(e);}finally{if(button)button.disabled=false;}}
function render(){
  const scope=$('#scope-filter').value,party=$('#party-filter').value,status=$('#status-filter').value;
  const rows=state.receipts.filter(r=>(!scope||r.scope_id===scope)&&(!party||r.party_id===party)&&(!status||r.status===status));
  const total=predicate=>rows.filter(predicate).reduce((n,r)=>n+r.payable_cents,0);
  $('#metrics').replaceChildren();
  for(const [label,value] of [['Confirmed receipts',rows.reduce((n,r)=>n+r.received_cents,0)],['Stakeholder allocation',total(()=>true)],['Still payable',total(r=>r.status!=='SETTLED')],['Settled',total(r=>r.status==='SETTLED')]]){const d=document.createElement('div');d.className='metric';d.textContent=label;const s=document.createElement('strong');s.textContent=money(value);d.append(s);$('#metrics').append(d);}
  const tbody=$('#receipt-rows');tbody.replaceChildren();
  for(const r of rows){const tr=tbody.insertRow(),td=cell(tr,'');if(r.status==='UNALLOCATED'){const cb=document.createElement('input');cb.type='checkbox';cb.value=r.id;cb.setAttribute('aria-label','Select receipt '+r.reference);td.append(cb);}cell(tr,r.member_name,r.user_id);cell(tr,r.community_name,r.tenant_name);cell(tr,r.party_name,r.service_id);cell(tr,money(r.received_cents));cell(tr,money(r.payable_cents),(r.share_bps/100)+'%');cell(tr,r.reference,r.received_on);cell(tr,r.status);}
  empty(tbody,8);
  const payments=$('#payment-rows');payments.replaceChildren();
  for(const p of state.payments){const tr=payments.insertRow();cell(tr,p.id.slice(0,8),p.created_at.slice(0,10));cell(tr,p.party_name,p.beneficiary_reference);cell(tr,p.member_count);cell(tr,money(p.amount_cents));cell(tr,p.status);cell(tr,p.bank_reference||'-',p.settled_on);const td=cell(tr,'');
    if(p.status==='DRAFT'){if(state.canApprove&&p.created_by!==state.userId)action(td,'Approve',async()=>{await api('/payments/'+p.id+'/approve',{});await load();});action(td,'Cancel draft',async()=>{if(confirm('Cancel this draft and release its receipts?')){await api('/payments/'+p.id+'/cancel',{});await load();}});}
    if(p.status==='APPROVED'){action(td,'Export instruction',async()=>{const blob=await api('/payments/'+p.id+'/instruction',null,true);const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='payment-'+p.id+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});if(state.canApprove)action(td,'Reconcile',()=>{ $('#settle-form').elements.payment_id.value=p.id;$('#settle-dialog').showModal();});}
  }empty(payments,7);
  $('#audit-rows').replaceChildren();for(const a of state.audit){const tr=$('#audit-rows').insertRow();[a.created_at,a.actor,a.action,a.record_id].forEach(v=>cell(tr,v));}empty($('#audit-rows'),4);
  $('#party-list').replaceChildren();for(const p of state.parties){const el=document.createElement('p');el.textContent=`${p.name} | ${p.service_id} | ${p.share_bps/100}% | ${p.beneficiary_reference}`;$('#party-list').append(el);}
  $('#scope-form').hidden=!state.admin;$('#party-form').hidden=!state.admin;
  $('#staff-button').hidden=!state.admin;$('#staff-list').replaceChildren();
  for(const staff of state.staff){const p=document.createElement('p');p.textContent=staff.user_id+' - '+staff.role+' ';action(p,'Revoke',async()=>{if(confirm('Revoke Treasury access for this user?')){await api('/staff/'+encodeURIComponent(staff.user_id)+'/revoke',{});await load();}});$('#staff-list').append(p);}
}
async function load(){state=await api();$('#workspace').hidden=false;choices($('#scope-filter'),state.scopes,r=>r.tenant_name+' / '+r.community_name,'All communities');choices($('#party-filter'),state.parties,r=>r.name,'All stakeholders');choices($('#receipt-form').elements.scope_id,state.scopes,r=>r.tenant_name+' / '+r.community_name,'Select community');choices($('#receipt-form').elements.party_id,state.parties,r=>r.name,'Select stakeholder');render();}
$('#refresh').onclick=()=>run(load);
for(const id of ['scope-filter','party-filter','status-filter'])$('#'+id).onchange=render;
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('.view').forEach(s=>s.hidden=s.id!==b.dataset.tab);document.querySelectorAll('[data-tab]').forEach(t=>t.setAttribute('aria-pressed',String(t===b)));});
document.querySelectorAll('[data-dialog]').forEach(b=>b.onclick=()=>$('#'+b.dataset.dialog).showModal());
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('#draft').onclick=()=>run(async()=>{const receipt_ids=[...document.querySelectorAll('#receipt-rows input:checked')].map(c=>c.value);if(!receipt_ids.length)throw new Error('Select at least one unallocated receipt.');await api('/payments',{receipt_ids});await load();document.querySelector('[data-tab="payments"]').click();});
function form(id,path,transform=x=>x){$(id).onsubmit=e=>{e.preventDefault();run(async()=>{const body=transform(Object.fromEntries(new FormData(e.target)));await api(typeof path==='function'?path(body):path,body);e.target.reset();e.target.closest('dialog')?.close();await load();},e.submitter);};}
form('#scope-form','/scopes');form('#party-form','/parties',b=>({...b,share_bps:Math.round(Number(b.percentage)*100)}));
form('#receipt-form','/receipts',b=>({...b,received_cents:Math.round(Number(b.amount)*100)}));
form('#settle-form',b=>'/payments/'+b.payment_id+'/settle');
form('#staff-form','/staff');
run(load);

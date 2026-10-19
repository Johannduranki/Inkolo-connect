const $=selector=>document.querySelector(selector);
let users=[],page=0;
let selected=null,initial='',saving=false;
async function api(path,body){
  const token=sessionStorage.getItem('duranki_access_token')||localStorage.getItem('duranki_access_token');
  const response=await fetch('/api/platform/admin/users'+path,{method:body?'PUT':'GET',headers:{Authorization:'Bearer '+(token||''),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const data=await response.json();if(!response.ok)throw new Error(data.message||'Unable to load or save profile.');return data;
}
const formValues=()=>Object.fromEntries(new FormData($('#profile-form')));
async function openProfile(id){
  $('#profile-error').textContent='';$('#profile-form').hidden=true;$('#profile-title').textContent='Loading profile...';$('#profile-dialog').showModal();
  try{
    selected=await api('/'+encodeURIComponent(id)+'/profile');
    $('#profile-title').textContent=selected.fullName||'User profile';
    for(const input of $('#profile-form').querySelectorAll('input'))input.value=selected[input.name]??selected.profile?.[input.name]??'';
    $('#profile-form').elements.telephoneNumber.readOnly=String(selected.id)==='1000001';
    $('#profile-details').replaceChildren();
    const add=(heading,text)=>{const h=document.createElement('h3');h.textContent=heading;const p=document.createElement('p');p.textContent=text;$('#profile-details').append(h,p);};
    add('Account',`User ${selected.id} | ${selected.status} | ${selected.roles.join(', ')}`);
    add('Communities',selected.communities.map(c=>`${c.communityName||c.churchName}${c.tenantId?' ('+c.tenantId+')':''}`).join('; ')||'No community assigned');
    const summary=selected.monthlyContribution;
    const money=(cents,currency)=>{try{return new Intl.NumberFormat('en-ZA',{style:'currency',currency}).format(cents/100);}catch{return currency+' '+(cents/100).toFixed(2);}};
    add('Monthly contribution',!summary.hasRecords?'Not recorded':Object.entries(summary.totals).map(([currency,cents])=>money(cents,currency)).join(' + ')||(summary.incomplete?'Not recorded':'No active monthly contributions'));
    if(summary.incomplete)add('Billing information incomplete','Some active subscriptions have no recorded amount or billing frequency. They are excluded from the monthly total.');
    if(selected.subscriptions.length){
      const wrap=document.createElement('div');wrap.style.overflowX='auto';const table=document.createElement('table');table.setAttribute('aria-label','Service subscriptions and contributions');
      const head=table.createTHead().insertRow();for(const label of ['Service / plan','Status','Amount','Billing frequency','Monthly contribution']){const th=document.createElement('th');th.textContent=label;head.append(th);}
      const body=table.createTBody();
      for(const s of selected.subscriptions){const row=body.insertRow();for(const value of [s.serviceName+' / '+(s.planLabel||'-'),s.status,s.amountCents===null?'Not recorded':money(s.amountCents,s.currency),s.billingCycle,s.monthlyAmountCents===null?'Not recorded':money(s.monthlyAmountCents,s.currency)])row.insertCell().textContent=value;}
      wrap.append(table);$('#profile-details').append(wrap);
      add('Contribution basis','Monthly totals include active subscriptions with recorded monthly fees. These are subscription charges, not proof of payment.');
    }else add('Services','No subscription records are available for this user. Imported user records did not include subscription or payment history.');
    add('Review',selected.importReview.join(', ')||'No review flags');
    if(selected.sourceUserId)add('Imported record',`Source user ${selected.sourceUserId}`);
    initial=JSON.stringify(formValues());$('#profile-form').hidden=false;
  }catch(error){$('#profile-error').textContent=error.message;$('#profile-title').textContent='Profile unavailable';$('#profile-form').hidden=false;$('#profile-save').disabled=true;}
}
function closeProfile(){if(saving)return;if(JSON.stringify(formValues())!==initial&&!confirm('Discard unsaved profile changes?'))return;$('#profile-dialog').close();$('#profile-save').disabled=false;}
$('#profile-close').onclick=closeProfile;
$('#profile-dialog').addEventListener('cancel',event=>{event.preventDefault();closeProfile();});
$('#profile-form').onsubmit=async event=>{
  event.preventDefault();if(!selected||saving)return;saving=true;$('#profile-save').disabled=true;$('#profile-error').textContent='';
  try{const values=formValues();await api('/'+encodeURIComponent(selected.id)+'/profile',{...values,version:selected.version});
    const user=users.find(u=>u.id===selected.id);Object.assign(user,values,{fullName:values.firstName+' '+values.lastName});render();$('#profile-dialog').close();$('#message').textContent='Profile saved successfully.';
  }catch(error){$('#profile-error').textContent=error.message;}finally{saving=false;$('#profile-save').disabled=false;}
};
function render(){
  const query=$('#search').value.trim().toLowerCase(),community=$('#community').value,status=$('#status').value;
  const rows=users.filter(u=>(!query||`${u.fullName} ${u.telephoneNumber}`.toLowerCase().includes(query))&&(!community||u.communities.some(c=>c.id===community))&&(!status||(status==='review'?u.importReview.length:u.status===status)));
  const pages=Math.max(1,Math.ceil(rows.length/100));page=Math.min(page,pages-1);
  $('#users').replaceChildren();
  for(const user of rows.slice(page*100,(page+1)*100)){
    const tr=document.createElement('tr');
    const name=document.createElement('td'),button=document.createElement('button');button.className='user-link';button.textContent=user.fullName||'Unnamed user';button.onclick=()=>openProfile(user.id);name.append(button);tr.append(name);
    for(const value of [user.telephoneNumber,user.email,user.communities.map(c=>c.name).join(', ')||'Unassigned',user.status,(user.importReview||[]).join(', ')]){
      const td=document.createElement('td');td.textContent=value||'';tr.append(td);
    }$('#users').append(tr);
  }
  $('#message').textContent=`${rows.length} matching users / ${users.length} total users`;
  $('#page').textContent=`Page ${page+1} of ${pages}`;$('#previous').disabled=page===0;$('#next').disabled=page>=pages-1;
}
for(const id of ['search','community','status'])$('#'+id).addEventListener('input',()=>{page=0;render();});
$('#previous').onclick=()=>{page--;render();};$('#next').onclick=()=>{page++;render();};
(async()=>{
  try{
    const token=sessionStorage.getItem('duranki_access_token')||localStorage.getItem('duranki_access_token');
    if(!token)throw new Error('Sign in as a Duranki administrator to view users.');
    const response=await fetch('/api/platform/admin/users',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
    if(!response.ok)throw new Error('Unable to load users. Sign in as a Duranki administrator and complete two-factor authentication.');
    users=await response.json();const communities=new Map();
    for(const user of users)for(const c of user.communities)communities.set(c.id,c.name);
    for(const [id,name] of [...communities].sort((a,b)=>a[1].localeCompare(b[1]))){const option=document.createElement('option');option.value=id;option.textContent=name;$('#community').append(option);}
    render();
  }catch(error){$('#message').textContent=error.message;$('#previous').disabled=true;$('#next').disabled=true;}
})();

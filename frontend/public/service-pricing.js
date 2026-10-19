(()=>{
  const rows=document.getElementById('prices'),notice=document.getElementById('notice');
  const token=()=>sessionStorage.getItem('duranki_access_token')||localStorage.getItem('duranki_access_token')||'';
  async function api(path='',body){const response=await fetch('/api/service-pricing'+path,{method:body?'PUT':'GET',headers:{Authorization:'Bearer '+token(),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.message||'Sign in as Platform Admin to configure prices.');return data;}
  function label(text,control){const node=document.createElement('label'),span=document.createElement('span');span.textContent=text;node.append(span,control);return node;}
  async function load(){try{const data=await api();rows.replaceChildren();notice.textContent=data.canEdit?'Platform-wide monthly pricing. Unconfigured services cannot accept new subscriptions.':'Read-only service prices.';
    for(const item of data.services){
      const form=document.createElement('form');form.className='price-row';
      const title=document.createElement('h2');title.textContent=item.name;
      const readiness=document.createElement('small');readiness.style.cssText='display:block;font:400 12px/1.5 Segoe UI,sans-serif;margin-top:8px';readiness.textContent=(item.readiness||'Status unavailable')+(item.readinessDetail?' - '+item.readinessDetail:'');title.append(readiness);
      const mode=document.createElement('select');mode.setAttribute('aria-label',item.name+' billing');
      for(const [value,text]of [['unconfigured','Not configured'],['free','Free'],['paid','Paid monthly']]){const option=document.createElement('option');option.value=value;option.textContent=text;option.disabled=value==='unconfigured';mode.append(option);}mode.value=item.mode;
      const amount=document.createElement('input');amount.type='number';amount.min='0.01';amount.max='1000000';amount.step='0.01';amount.inputMode='decimal';amount.setAttribute('aria-label',item.name+' monthly amount');amount.value=item.amountCents==null?'':(item.amountCents/100).toFixed(2);
      const save=document.createElement('button');save.textContent='Save';save.type='submit';const status=document.createElement('p');status.className='row-status';status.setAttribute('role','status');
      const numberInput=(name,value,max)=>{const input=document.createElement('input');input.type='number';input.min='0';input.max=String(max);input.step='0.01';input.required=true;input.inputMode='decimal';input.setAttribute('aria-label',item.name+' '+name);input.value=value==null?'':(value/100).toFixed(2);return input;};
      const cost=numberInput('monthly cost',item.costCents,1000000);
      const parties=['community','tenant','duranki'];
      const shares=Object.fromEntries(parties.map(p=>[p,numberInput(p+' share',item.shares?.[p],100)]));
      const preview=document.createElement('p');preview.className='price-preview';preview.setAttribute('role','status');
      const cents=input=>{if(!/^\d+(\.\d{1,2})?$/.test(input.value))throw Error('Enter all amounts and percentages with up to two decimal places.');return Math.round(Number(input.value)*100);};
      const values=()=>{const amountCents=mode.value==='free'?0:cents(amount),costCents=cents(cost),split=Object.fromEntries(parties.map(p=>[p,cents(shares[p])]));if(Object.values(split).some(v=>v>10000)||Object.values(split).reduce((a,b)=>a+b,0)!==10000)throw Error('Community, tenant and Duranki shares must total 100%.');return {amountCents,costCents,shares:split};};
      const money=value=>'R'+(value/100).toFixed(2);
      const updatePreview=()=>{try{const v=values(),margin=v.amountCents-v.costCents,positive=Math.max(0,margin);const allocations=parties.map((p,i)=>({p,i,cents:Math.floor(positive*v.shares[p]/10000),remainder:positive*v.shares[p]%10000}));let remaining=positive-allocations.reduce((sum,a)=>sum+a.cents,0);for(const a of [...allocations].sort((a,b)=>b.remainder-a.remainder||a.i-b.i))if(remaining-->0)a.cents++;preview.textContent=(margin<0?'Monthly loss: '+money(-margin):'Monthly margin: '+money(margin))+' | '+allocations.map(a=>(a.p==='duranki'?'Duranki':a.p[0].toUpperCase()+a.p.slice(1))+': '+money(a.cents)).join(' | ');}catch(error){preview.textContent=error.message;}};
      const sync=()=>{amount.disabled=!data.canEdit||mode.value!=='paid';amount.required=mode.value==='paid';save.disabled=!data.canEdit||mode.value==='unconfigured';};mode.disabled=!data.canEdit;mode.onchange=()=>{if(mode.value==='free')amount.value='0.00';else if(Number(amount.value)===0)amount.value='';sync();updatePreview();};sync();
      form.append(title,label('Billing',mode),label('Monthly sale price (ZAR)',amount));
      if(data.canEdit){form.append(label('Monthly cost price (ZAR)',cost));for(const p of parties)form.append(label((p==='duranki'?'Duranki':p[0].toUpperCase()+p.slice(1))+' share (%)',shares[p]));form.append(save,preview,status);form.oninput=updatePreview;updatePreview();}
      form.onsubmit=async event=>{event.preventDefault();if(!data.canEdit)return;save.disabled=true;try{const result=await api('/'+encodeURIComponent(item.code),{mode:mode.value,...values(),revision:item.revision});Object.assign(item,result);status.textContent='Saved: '+(result.mode==='free'?'Free':money(result.amountCents)+' per month')+'. Existing subscriptions unchanged. No payments or accounting entries created.';updatePreview();}catch(error){status.textContent=error.message;}finally{sync();}};
      rows.append(form);
    }
  }catch(error){notice.textContent=error.message;rows.replaceChildren();}}
  document.getElementById('refresh').onclick=load;load();
})();

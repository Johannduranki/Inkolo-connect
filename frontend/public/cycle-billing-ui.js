(() => {
  if(location.pathname!=='/payments/cycle')return;
  const $=id=>document.getElementById(id),query=new URLSearchParams(location.search);
  let data,purpose=query.get('purpose')==='wallet-top-up'?'wallet-top-up':'subscription',key=crypto.randomUUID(),busy=false;
  const money=n=>new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'}).format((n||0)/100);
  async function api(path,body){const token=sessionStorage.getItem('duranki_access_token')||localStorage.getItem('duranki_access_token')||'';
    const r=await fetch('/api/cycle/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.message||'Payment request unavailable.');return d;}
  function options(select,rows){select.replaceChildren();for(const [value,label]of rows){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}}
  function community(){return data?.communities.find(c=>c.id===$('billing-community').value);}
  function service(){return community()?.services.find(s=>s.code===$('billing-service').value);}
  function sync(){
    const wallet=purpose==='wallet-top-up',s=service(),c=community();
    $('service-field').hidden=wallet;$('billing-service').disabled=wallet;$('amount-field').hidden=!wallet;$('billing-amount').required=wallet;
    $('subscription-tab').setAttribute('aria-pressed',String(!wallet));$('wallet-tab').setAttribute('aria-pressed',String(wallet));
    $('billing-price').textContent=wallet?'Wallet top-up: one payment, no automatic top-ups.':s?.mode==='paid'?money(s.amountCents)+' per month':s?.mode==='free'?'This service is free. Activate it from your member dashboard.':'Monthly price not configured.';
    let reason=!c?'Join a community to continue.':!data.ready?'Cycle Pay is awaiting developer configuration.':wallet?(!c.walletEnabled?'Wallet funding is not enabled for this community.':!data.topUpsEnabled?'Wallet top-ups are awaiting configuration.':''):s?.issue||(!s||s.mode!=='paid'?'Select a configured paid service.':!data.recurringReady?'Recurring billing is awaiting configuration.':'');
    $('billing-readiness').textContent=reason||'Card details are entered securely on Cycle Pay.';
    $('billing-submit').disabled=busy||!!reason;
    $('billing-terms').textContent=wallet?'I authorise this one-off wallet payment through Cycle Pay.':`I authorise ${money(s?.amountCents)} each month for ${s?.name||'this service'}. Cycle Pay may securely save my payment profile for renewals. I can cancel future renewals in My payments. A changed price requires my renewed consent.`;
  }
  function services(){options($('billing-service'),(community()?.services||[]).map(s=>[s.code,s.name]));if(query.get('service')&&community()?.services.some(s=>s.code===query.get('service')))$('billing-service').value=query.get('service');sync();}
  async function load(){try{data=await api('billing');$('billing').hidden=false;options($('billing-community'),data.communities.map(c=>[c.id,c.tenantName+' / '+c.name]));const chosen=data.communities.find(c=>c.id===query.get('communityId')||c.aliases?.includes(query.get('communityId')));if(chosen)$('billing-community').value=chosen.id;services();
    $('billing-notice').textContent=data.mode==='sandbox'?'Sandbox mode: payments do not activate live services or credit real wallet funds.':query.has('requestId')?'Payment submitted. Access or wallet funds are updated only after verified confirmation.':'';
    $('billing-subscriptions').replaceChildren();if(!data.subscriptions.length)$('billing-subscriptions').textContent='No Cycle subscriptions yet.';
    for(const s of data.subscriptions){const row=document.createElement('article');row.className='billing-subscription';const title=document.createElement('h3');title.textContent=(data.communities.find(c=>c.id===s.community_id)?.services.find(x=>x.code===s.service_code)?.name||s.service_code);const p=document.createElement('p');p.textContent=[money(s.amount_cents)+'/month',s.mode,s.state,s.paid_until?'Paid until '+new Date(s.paid_until).toLocaleDateString('en-ZA'):'Awaiting payment'].join(' | ');row.append(title,p);if(!s.cancelled_at){const button=document.createElement('button');button.type='button';button.textContent='Cancel renewal';button.onclick=async()=>{if(!confirm('Cancel future renewals? Paid access remains until expiry.'))return;button.disabled=true;try{const result=await api('subscriptions/'+encodeURIComponent(s.id)+'/cancel',{});await load();$('billing-notice').textContent=result.message;}catch(e){$('billing-notice').textContent=e.message;button.disabled=false;}};row.append(button);}$('billing-subscriptions').append(row);}
    $('billing-form').hidden=false;
    for(const [index,s] of data.subscriptions.entries()){const status=document.createElement('p');status.textContent='Renewal: '+s.renewalStatus;$('billing-subscriptions').children[index]?.append(status);}
  }catch(e){$('billing').hidden=false;$('billing-form').hidden=true;$('billing-notice').textContent=e.message;}}
  for(const [id,value]of [['subscription-tab','subscription'],['wallet-tab','wallet-top-up']])$(id).onclick=()=>{purpose=value;key=crypto.randomUUID();$('billing-consent').checked=false;sync();};
  $('billing-community').onchange=()=>{key=crypto.randomUUID();$('billing-consent').checked=false;services();};
  $('billing-service').onchange=()=>{key=crypto.randomUUID();$('billing-consent').checked=false;sync();};$('billing-amount').onchange=()=>{key=crypto.randomUUID();};
  $('billing-form').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;sync();try{const s=service(),amount=$('billing-amount').value;if(purpose==='wallet-top-up'&&!/^\d+(\.\d{1,2})?$/.test(amount))throw Error('Enter an amount with up to two decimal places.');
    const row=await api('billing',{purpose,communityId:community()?.id,serviceCode:s?.code,amountCents:purpose==='wallet-top-up'?Math.round(Number(amount)*100):s?.amountCents,priceRevision:s?.revision,termsVersion:data.termsVersion,accepted:$('billing-consent').checked,idempotencyKey:key});
    const checkout=await api('requests/'+encodeURIComponent(row.id)+'/checkout',{});
    if(!['https://sandbox.cyclepay.net/pwv4/launch','https://payment.cyclepay.net/pwv4/launch'].includes(checkout.action))throw Error('Unexpected checkout address.');
    const form=document.createElement('form');form.method='POST';form.action=checkout.action;for(const name of ['payload','signature']){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=checkout[name];form.append(input);}document.body.append(form);form.submit();
  }catch(e){$('billing-notice').textContent=e.message;busy=false;sync();}};
  $('refresh').addEventListener('click',load);
  load();
})();

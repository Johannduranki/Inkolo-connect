(() => {
  const $ = id => document.getElementById(id), node = (tag, text) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n; };
  const money = cents => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(cents / 100);
  let directory, data, admin = new URLSearchParams(location.search).get('admin') === '1', requestNumber = 0;
  const statusNames = { pending:'Pending manual review', approved:'Account approved', rejected:'Application rejected', collecting:'Collecting group orders', ready_manual:'Ready for manual submission', submitted_manual:'Submitted to supplier manually', fulfilled:'Fulfilled', cancelled:'Cancelled' };
  async function api(action = '', body, query = '') {
    const token = sessionStorage.getItem('duranki_access_token') || localStorage.getItem('duranki_access_token');
    const r = await fetch('/api/wholesalers' + (action ? '/' + action : '') + query, { method: body ? 'POST' : 'GET', headers: { Authorization:'Bearer ' + token, 'Content-Type':'application/json' }, body: body ? JSON.stringify(body) : undefined, cache:'no-store' });
    const result = await r.json(); if (!r.ok) throw Error(result.message || 'Request failed. Please sign in again.'); return result;
  }
  function field(form, label, type = 'text') { const l=node('label',label), i=node('input'); i.type=type; i.required=true; l.append(i); form.append(l); return i; }
  function button(label, run) { const b=node('button',label); b.type='button'; b.className='secondary'; b.onclick=()=>label.startsWith('Edit ')?run():perform(b,run); return b; }
  async function perform(button, run) { button.disabled=true; $('message').textContent=''; try { await run(); await load(); $('message').textContent='Saved. Manual processing only; no payment was taken.'; } catch(e) { $('message').textContent=e.message; } finally { button.disabled=false; } }
  function table(target, headings, rows) { const t=node('table'), head=node('thead'), tr=node('tr'), body=node('tbody'); for(const h of headings) tr.append(node('th',h)); head.append(tr); for(const row of rows){ const tr=node('tr'); for(const cell of row){const td=node('td'); td.append(cell instanceof Node ? cell : node('span',cell ?? ''));tr.append(td);}body.append(tr);}t.append(head,body);$(target).replaceChildren(rows.length?t:node('p','No records yet.')); }
  function amount(value) { if (!/^\d+(\.\d{1,2})?$/.test(value)) throw Error('Use a positive amount with at most two decimal places.'); return Math.round(Number(value)*100); }
  const supplierName=id=>data.suppliers.find(s=>s.id===id)?.name||id;
  function render() {
    $('setup').hidden=!admin; $('groups-section').hidden=!admin; $('orders-title').textContent=admin?'Tenant orders':'My orders';
    const sf=$('supplier-form'), of=$('offer-form');
    of.elements.supplierId.replaceChildren(...data.suppliers.map(s=>{const o=node('option',s.name);o.value=s.id;return o;}));
    $('suppliers').replaceChildren(...data.suppliers.map(s=>{
      const box=node('article');box.className='item';box.append(node('h3',s.name),node('p',s.contact||'Contact your tenant administrator'),node('p',s.active?'Manual account applications':'Unavailable for new orders'));
      if(admin) box.append(button('Edit wholesaler',()=>{sf.elements.id.value=s.id;sf.elements.revision.value=s.revision;sf.elements.name.value=s.name;sf.elements.contact.value=s.contact;sf.elements.active.checked=s.active;sf.scrollIntoView({behavior:'smooth',block:'center'});}));
      else { const application=data.applications.find(a=>a.supplierId===s.id); if(application) box.append(node('strong',statusNames[application.status])); else {const form=node('form'), business=field(form,'Business / trading name');business.maxLength=160;const b=node('button','Apply for supplier account');form.append(b);form.onsubmit=e=>{e.preventDefault();perform(b,()=>api('apply',{supplierId:s.id,communityId:$('scope').value,businessName:business.value}));};box.append(form);} }
      return box;
    }));
    if(!data.suppliers.length) $('suppliers').append(node('p','No wholesalers configured for this tenant.'));
    $('offers').replaceChildren(...data.offers.map(o=>{
      const box=node('article');box.className='item';const threshold=o.thresholdType==='quantity'?o.threshold+' '+o.unit:money(o.threshold);
      box.append(node('h3',o.product),node('p',supplierName(o.supplierId)),node('strong','Normal price: '+money(o.unitPriceCents)+' / '+o.unit));
      if(admin||data.discountEligible) box.append(node('p','Subscriber price: '+money(o.unitPriceCents-Math.floor(o.unitPriceCents*o.discountBps/10000))+' / '+o.unit+' ('+(o.discountBps/100)+'% discount from '+threshold+')'));
      else {const link=node('a','Subscribe to Buy and Sell for discounted prices');link.href='/payments/cycle?communityId='+encodeURIComponent($('scope').value);box.append(node('p','Normal pricing - no active paid Buy and Sell subscription.'),link);}
      box.append(node('p','Closes '+new Date(o.closesAt).toLocaleString()));
      if(admin) box.append(button('Edit offer',()=>{for(const k of ['id','revision','supplierId','product','unit','thresholdType'])of.elements[k].value=o[k];of.elements.price.value=(o.unitPriceCents/100).toFixed(2);of.elements.discount.value=(o.discountBps/100).toFixed(2);thresholdLabel();of.elements.threshold.value=o.thresholdType==='value'?(o.threshold/100).toFixed(2):o.threshold;const dt=new Date(o.closesAt);of.elements.closesAt.value=new Date(dt.getTime()-dt.getTimezoneOffset()*60000).toISOString().slice(0,16);of.scrollIntoView({behavior:'smooth',block:'center'});}));
      else {
        const group=data.groups.find(g=>g.offerId===o.id), form=node('form'), q=field(form,'Quantity ('+o.unit+')','number');q.min='1';q.max='1000000';q.step='1';q.value='1';
        const l=node('label','Order type'), mode=node('select');for(const [v,t]of [['individual','Individual order'],['group','Join community bulk order']]){const opt=node('option',t);opt.value=v;mode.append(opt);}l.append(mode);form.append(l);
        const preview=node('p'), b=node('button','Place manual order request');let requestId=crypto.randomUUID();
        const update=()=>{const quantity=Number(q.value), count=mode.value==='group'?(group?.quantity||0)+quantity:quantity;const reached=(o.thresholdType==='quantity'?count:count*o.unitPriceCents)>=o.threshold;const sub=quantity*o.unitPriceCents;preview.textContent=(mode.value==='group'?'Estimated total: ':'Order total: ')+money(sub-(reached?Math.floor(sub*o.discountBps/10000):0))+(mode.value==='group'?' - discount locks when the admin closes the group.':'');b.disabled=!data.applications.some(a=>a.supplierId===o.supplierId&&a.status==='approved')||new Date(o.closesAt)<=new Date()||(mode.value==='group'&&group?.closed);};q.oninput=mode.onchange=update;update();
        if(group) box.append(node('p','Group: '+group.quantity+' units from '+group.traders+' traders'+(group.closed?' - closed':'')));
        form.append(preview,b);form.onsubmit=e=>{e.preventDefault();perform(b,async()=>{await api('order',{communityId:$('scope').value,offerId:o.id,quantity:Number(q.value),mode:mode.value,requestId});requestId=crypto.randomUUID();});};box.append(form);
      } return box;
    }));
    if(!data.offers.length)$('offers').append(node('p','No offers configured.'));
    table('applications',['Wholesaler','Business','Member','Status','Supplier account reference','Review'],data.applications.map(a=>{
      const actions=node('div');if(admin&&a.status==='pending'){const form=node('form'), ref=field(form,'Confirmed supplier account reference');ref.maxLength=160;const approve=node('button','Approve');form.append(approve);form.onsubmit=e=>{e.preventDefault();perform(approve,()=>api('review',{id:a.id,status:'approved',supplierReference:ref.value}));};actions.append(form,button('Reject',()=>api('review',{id:a.id,status:'rejected',supplierReference:''})));}return[supplierName(a.supplierId),a.businessName,a.userId,statusNames[a.status],a.supplierReference,actions];
    }));
    table('groups',['Offer','Community','Quantity','Threshold progress','Action'],data.groups.filter(g=>g.quantity||g.closed).map(g=>{const o=data.offers.find(o=>o.id===g.offerId);const b=button(g.closed?'Closed':'Close group and lock discount',()=>api('close-group',{offerId:g.offerId,communityId:g.communityId}));b.disabled=g.closed||!g.qualified;return[o.product,g.communityId,g.quantity,o.thresholdType==='quantity'?g.progress+' / '+g.threshold:money(g.progress)+' / '+money(g.threshold),b];}));
    table('orders',['Order / product','Quantity / type','Status','Total','Supplier reference','Action'],data.orders.map(o=>{
      const actions=node('div');if(admin&&o.status==='ready_manual'){const form=node('form'),ref=field(form,'Supplier order reference');ref.maxLength=160;const b=node('button','Mark submitted manually');form.append(b);form.onsubmit=e=>{e.preventDefault();perform(b,()=>api('status',{id:o.id,status:'submitted_manual',supplierReference:ref.value}));};actions.append(form);}
      if(admin&&o.status==='submitted_manual')actions.append(button('Mark fulfilled',()=>api('status',{id:o.id,status:'fulfilled'})));
      if((admin||!o.closedAt)&&(['collecting','ready_manual'].includes(o.status)||(admin&&o.status==='submitted_manual')))actions.append(button('Cancel request',()=>api('status',{id:o.id,status:'cancelled'})));
      return[o.id.slice(0,8)+' / '+o.product,o.quantity+' / '+o.mode,statusNames[o.status],o.quote?money(o.quote.totalCents):'Pending group closure',o.supplierReference||'Not submitted',actions];
    }));
  }
  function clear() { for(const id of ['suppliers','offers','applications','groups','orders'])$(id).replaceChildren();$('setup').hidden=true; }
  async function load() { const request=++requestNumber; clear(); if(!$('scope').value){$('message').textContent=admin?'No managed tenants available.':'No joined community has Buy and Sell enabled.';return;} const query='?'+(admin?'tenantId':'communityId')+'='+encodeURIComponent($('scope').value);try{const result=await api('',undefined,query);if(request!==requestNumber)return;data=result;render();}catch(e){if(request===requestNumber)$('message').textContent=e.message;} }
  function chooseMode(){admin=admin&&directory.tenants.length>0;$('admin-tab').hidden=!directory.tenants.length;$('platform-link').hidden=!directory.platformAdmin;$('shop-tab').setAttribute('aria-pressed',String(!admin));$('admin-tab').setAttribute('aria-pressed',String(admin));$('scope-label').firstChild.textContent=admin?'Tenant':'Community';const rows=admin?directory.tenants:directory.communities;const selected=new URLSearchParams(location.search).get(admin?'tenantId':'communityId');$('scope').replaceChildren(...rows.map(r=>{const o=node('option',r.name||r.id);o.value=r.id;return o;}));if(rows.some(r=>r.id===selected))$('scope').value=selected;load();}
  const sf=$('supplier-form'),of=$('offer-form');
  sf.onsubmit=e=>{e.preventDefault();const f=sf.elements;perform(e.submitter,async()=>{await api('supplier',{tenantId:$('scope').value,id:f.id.value||undefined,revision:Number(f.revision.value),name:f.name.value,contact:f.contact.value,active:f.active.checked});sf.reset();});};
  function thresholdLabel(){const f=of.elements,byValue=f.thresholdType.value==='value';$('threshold-label').firstChild.textContent=byValue?'Minimum order value (ZAR)':'Minimum quantity';f.threshold.step=byValue?'0.01':'1';f.threshold.min=byValue?'0.01':'1';}
  of.elements.thresholdType.onchange=thresholdLabel;
  of.onsubmit=e=>{e.preventDefault();perform(e.submitter,async()=>{const f=of.elements;await api('offer',{id:f.id.value||undefined,revision:Number(f.revision.value),supplierId:f.supplierId.value,product:f.product.value,unit:f.unit.value,unitPriceCents:amount(f.price.value),discountBps:amount(f.discount.value),thresholdType:f.thresholdType.value,threshold:f.thresholdType.value==='value'?amount(f.threshold.value):Number(f.threshold.value),closesAt:new Date(f.closesAt.value).toISOString()});of.reset();thresholdLabel();});};
  $('new-supplier').onclick=()=>sf.reset();$('new-offer').onclick=()=>{of.reset();thresholdLabel();};
  $('scope').onchange=()=>{sf.reset();of.reset();load();};$('refresh').onclick=load;$('shop-tab').onclick=()=>{admin=false;chooseMode();};$('admin-tab').onclick=()=>{admin=true;chooseMode();};
  api().then(result=>{directory=result;chooseMode();}).catch(e=>{$('message').textContent=e.message+' ';const a=node('a','Sign in');a.href='/login';$('message').append(a);});
})();

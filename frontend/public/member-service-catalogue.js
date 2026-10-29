// Canonical service codes match the admin catalogue. Native codes preserve existing member handlers.
export const memberCapabilities = {
  marketplace:{native:'build-up-balance'}, jobs:{native:'job-search'},
  wallet:{issue:'Provider connection required',detail:'Wallet records are available, but live funding and withdrawal integrations require setup.'},
  payments:{issue:'Provider connection required',detail:'Live payment collection must be configured before member payments can be activated.'},
  airtime:{issue:'Provider connection required',detail:'Airtime and data belong to VAS. Live provider fulfilment is not connected.'},
  utilities:{issue:'Provider connection required',detail:'Prepaid electricity belongs to VAS. Live token fulfilment is not connected.'},
  'vas-services':{issue:'Provider connection required',detail:'Airtime, data and electricity screens exist, but live provider fulfilment is not connected.'},
  'community-membership':{}, community:{},
  'grant-distribution':{route:'/dashboard/trader-training',detail:'Grant eligibility is linked to published training. Eligibility does not transfer funds.'},
  'trader-training':{route:'/dashboard/trader-training',detail:'A published community programme is required before lessons and assessments can begin.'},
  'vuma-fibre':{issue:'Provider connection required',detail:'Live connectivity ordering and provider fulfilment require setup.'},
  internet:{issue:'Provider connection required',detail:'Internet is a separate enabled service. Its provider and ordering workflow require setup.'},
  insurance:{issue:'Not yet implemented'}, education:{native:'eduu',issue:'Not yet implemented'},
  'funeral-cover':{native:'funeral',issue:'View cover plans',detail:'Individual and family applications use separately configured cover prices. Payment and provider confirmation are required before cover is active.'},
  loans:{issue:'Not yet implemented',detail:'Loan applications, approvals and payouts are not connected.'},
  pos:{issue:'Not yet implemented'}, deliveries:{native:'catch-a-ride',detail:'Ride requests and matching are available; payment settlement is separate.'},
  'business-services':{issue:'Not yet implemented'},projects:{issue:'Not yet implemented'},
  referral:{issue:'Provider connection required',detail:'Automated referral rewards and recurring payouts are not connected.'},
  'keycha-properties':{}, kzncc:{}, heritage:{route:'/dashboard/heritage'}
};

export function reconcileMemberCatalogue(existing, rows, loaded = true, context = {}) {
  return rows.map(row => {
    const cap = memberCapabilities[row.code] || {issue:'Not yet implemented'};
    const code = cap.native || row.code;
    const old = existing.find(s => s.code === code) || {};
    const training = ['trader-training','grant-distribution'].includes(row.code);
    const programmeStatus = training ? context.trainingLoaded ? context.programmeReady ? '' : 'Programme setup required' : 'Programme status unavailable' : '';
    const status = cap.issue || (!loaded ? 'Status unavailable' : row.mode === 'unconfigured' || !row.mode ? 'Pricing required' : row.mode === 'paid' ? row.checkoutReady ? programmeStatus || 'Cycle Pay checkout' : 'Payment setup required' : programmeStatus || 'Available');
    const detail = cap.detail || (cap.issue ? 'The member workflow has not been implemented yet.' : '');
    const priceNote = !loaded ? 'Service pricing could not be loaded. Refresh to retry.' : !row.mode || row.mode === 'unconfigured' ? 'An administrator must set free access or a monthly price.' : row.mode === 'paid' ? 'Monthly access price: R'+(row.amountCents/100).toFixed(2)+(row.checkoutReady?'. Pay securely through Cycle Pay.':'. Cycle Pay configuration is required.') : 'No monthly access fee.';
    const blocked = !['Available','Cycle Pay checkout'].includes(status);
    return {...old,code,name:row.name,canonicalCode:row.code,image:row.logoUrl || (row.code === 'funeral-cover' ? context.funeralLogo : '') || old.image || '',accent:old.accent || '#007c94',
      description:[detail,priceNote].filter(Boolean).join(' '),tag:status,catalogueStatus:status,catalogueDetail:[detail,priceNote].filter(Boolean).join(' '),
      catalogueConfigured: loaded && (row.code === 'funeral-cover' ? context.funeralReady === true : ['Available','Cycle Pay checkout'].includes(status)),
      catalogueBlocked:blocked,catalogueRoute:cap.route || '',availability:blocked?'coming-soon':'available',
      billingNote:priceNote,plans:['free','paid'].includes(row.mode)&&!cap.issue?[{code:row.mode==='free'?'configured-free':'configured-monthly',name:row.name+' access',price:row.mode==='free'?'Free':'R'+(row.amountCents/100).toFixed(2)+' / month',description:priceNote}]:[]};
  });
}

export function scopedMemberCatalogue(services,configuration,configuredOnly = false) {
  const selected=services.filter(service=>enabledMemberService(service,configuration));
  for(const code of configuration?.serviceCodes || []){
    if(selected.some(service=>enabledMemberService(service,{serviceCodes:[code]})))continue;
    selected.push({code,canonicalCode:code,name:String(code).replace(/-/g,' '),image:'/duranki-up-logo.png',accent:'#007c94',tag:'Not yet implemented',catalogueStatus:'Not yet implemented',catalogueDetail:'This enabled custom service does not yet have a member workflow.',catalogueBlocked:true,description:'This enabled custom service does not yet have a member workflow.',availability:'coming-soon',plans:[]});
  }
  return configuredOnly ? selected.filter(service => service.catalogueConfigured === true) : selected;
}

export function programmeContext(data,communityId) {
  const community=data?.communities?.find(c=>c.id===communityId||c.aliases?.includes(communityId));
  return {trainingLoaded:!!data,programmeReady:!!community&&data.programmes?.some(p=>p.communityId===community.id&&p.state==='PUBLISHED')};
}

export function enabledMemberService(service, configuration) {
  if(!configuration || !Array.isArray(configuration.serviceCodes))return false;
  const canonical = code => ({'build-up-balance':'marketplace','job-search':'jobs',funeral:'funeral-cover',eduu:'education','catch-a-ride':'deliveries',transport:'deliveries','uif-trader-training':'trader-training',membership:'community-membership'})[code] || code;
  return configuration.serviceCodes.some(code => canonical(code) === (service.canonicalCode || canonical(service.code)));
}

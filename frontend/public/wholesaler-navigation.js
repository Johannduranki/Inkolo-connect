(() => {
  function attach() {
    const member=location.pathname==='/dashboard/member'&&document.querySelector('.topbar');
    if(member&&!member.querySelector('[data-wholesaler-browse]')){const link=document.createElement('a');link.dataset.wholesalerBrowse='true';link.textContent='Wholesaler prices';link.href='/dashboard/wholesaler-orders'+location.search;member.append(link);}
    const area=document.querySelector('.marketplace-heading .business-heading-actions');
    if(area&&!area.querySelector('[data-wholesaler-link]')) {const link=document.createElement('a');link.dataset.wholesalerLink='true';link.textContent='Wholesaler Orders';link.href='/dashboard/wholesaler-orders'+location.search;area.prepend(link);}
    const admin=document.querySelector('.platform-page .topbar nav');
    if(admin&&!admin.querySelector('[data-wholesaler-admin]')){const link=document.createElement('a');link.dataset.wholesalerAdmin='true';link.textContent='Wholesaler Orders';link.href='/dashboard/wholesaler-orders?admin=1';admin.append(link);}
  }
  new MutationObserver(attach).observe(document.body,{childList:true,subtree:true});attach();
})();

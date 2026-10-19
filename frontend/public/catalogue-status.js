(() => {
  const style=document.createElement('style');style.textContent='.service-card .service-tag{max-width:calc(100% - 24px);white-space:normal;line-height:1.4}.service-card button{white-space:normal}.catalogue-dialog{width:min(520px,calc(100% - 32px));border:1px solid #c7d8df;border-radius:8px;padding:24px;color:#173443;font:15px/1.6 Segoe UI,sans-serif}.catalogue-dialog::backdrop{background:#132c3c88}.catalogue-dialog h2{font-size:22px;margin:0 0 12px}.catalogue-dialog button{padding:10px 20px;background:#007c94;border:0;border-radius:5px;color:white;font:inherit}';document.head.append(style);
  window.addEventListener('duranki-service-status',event=>{
    document.querySelector('.catalogue-dialog')?.remove();
    const dialog=document.createElement('dialog');dialog.className='catalogue-dialog';
    const title=document.createElement('h2');title.textContent=event.detail.name;
    const status=document.createElement('strong');status.textContent=event.detail.catalogueStatus;
    const detail=document.createElement('p');detail.textContent=event.detail.catalogueDetail;
    const close=document.createElement('button');close.textContent='Close';close.onclick=()=>dialog.close();
    dialog.append(title,status,detail,close);document.body.append(dialog);dialog.showModal();
  });
  function render(){
    if(location.pathname!=='/dashboard/member')return;
    for(const card of document.querySelectorAll('.service-card,.subscribed-service')){
      const status=card.querySelector('.service-tag,.subscribed-copy > span')?.textContent?.trim();
      if(!['Available','Pricing required','Payment setup required','Provider connection required','Not yet implemented','Status unavailable','Programme setup required','Programme status unavailable'].includes(status))continue;
      if(status==='Available')continue;
      if(card.matches('.subscribed-service')&&['Pricing required','Payment setup required'].includes(status))continue;
      for(const button of card.querySelectorAll('button'))if(button.textContent.trim()!=='View status')button.textContent='View status';
    }
    const count=document.querySelector('.services-section .section-heading > span');
    if(count&&/services available/.test(count.textContent))count.textContent=count.textContent.replace('services available','enabled services');
    const empty=document.querySelector('.all-subscribed');
    if(empty&&!document.querySelector('.subscribed-service')){
      const heading=empty.querySelector('h3'),description=empty.querySelector('p');
      if(heading&&heading.textContent!=='No services enabled')heading.textContent='No services enabled';
      if(description&&description.textContent!=='No services are enabled for both this tenant and community.')description.textContent='No services are enabled for both this tenant and community.';
    }
  }
  new MutationObserver(render).observe(document.body,{childList:true,subtree:true});render();
})();

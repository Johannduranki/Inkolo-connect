(() => {
  if(window.__durankiWalletKeys)return;
  window.__durankiWalletKeys=true;
  const prefix='duranki.wallet.pending.',requests=new WeakMap();
  const open=XMLHttpRequest.prototype.open,send=XMLHttpRequest.prototype.send,abort=XMLHttpRequest.prototype.abort;
  XMLHttpRequest.prototype.open=function(method,url,...rest){
    const target=new URL(url,location.href);
    requests.set(this,{eligible:method.toUpperCase()==='POST'&&target.origin===location.origin&&target.pathname==='/api/platform/wallet/transfer',aborted:false});
    return open.call(this,method,url,...rest);
  };
  XMLHttpRequest.prototype.abort=function(){const request=requests.get(this);if(request)request.aborted=true;return abort.call(this);};
  XMLHttpRequest.prototype.send=function(body){
    const request=requests.get(this);
    if(!request?.eligible||typeof body!=='string')return send.call(this,body);
    let data;
    try{data=JSON.parse(body);}catch{return send.call(this,body);}
    if(!data||typeof data!=='object'||Array.isArray(data)||data.idempotencyKey)return send.call(this,body);
    const xhr=this;
    // Persist only a SHA-256 fingerprint and random key, never payment details or credentials.
    const signature=JSON.stringify([data.recipientTelephoneNumber,data.amount,data.paymentReference||'']);
    crypto.subtle.digest('SHA-256',new TextEncoder().encode(signature)).then(hash=>{
      if(request.aborted||requests.get(xhr)!==request)return;
      const storageKey=prefix+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
      let key=sessionStorage.getItem(storageKey);
      if(!key){key=crypto.randomUUID();sessionStorage.setItem(storageKey,key);}
      data.idempotencyKey=key;
      xhr.addEventListener('load',()=>{if(xhr.status>=200&&xhr.status<300&&sessionStorage.getItem(storageKey)===key)sessionStorage.removeItem(storageKey);},{once:true});
      send.call(xhr,JSON.stringify(data));
    }).catch(()=>{if(!request.aborted&&requests.get(xhr)===request)xhr.dispatchEvent(new Event('error'));});
  };
})();

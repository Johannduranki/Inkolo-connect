import {randomUUID,createHmac} from 'node:crypto';
import {billingConfig,billingTerms,nextMonth,encrypt,decrypt} from './cycle-billing.js';
import {canonicalService,serviceCatalogue,effectiveServicePrice,serviceEnabled} from './service-pricing.js';
import {memberCapabilities} from '../../frontend/public/member-service-catalogue.js';
import {joinableCommunities,findMembership} from './community-registration.js';
import {signCyclePayload} from './cycle-pay.js';
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};

export class MysqlCycleBilling {
  constructor({store,readState,updateState,config,settings=billingConfig,fetcher=fetch,now=()=>new Date().toISOString(),serviceReady=()=>true}){
    if (!store) throw Error('A MariaDB cycle store is required.');
    Object.assign(this,{store,readState,updateState,config,settings,fetcher,now,serviceReady});
  }
  community(userId,id){const state=this.readState();const user=state.users.find(u=>String(u.id)===String(userId));
    if(user?.status!=='active')fail(403,'Active account required.');
    const c=joinableCommunities(state).find(c=>c.id===id||c.aliases?.includes(id));
    if(!c||!findMembership(state,userId,c))fail(403,'Join this community before making a payment.');return c;
  }
  enabled(community,code){return serviceEnabled(this.readState(),community,code);}
  price(code,context){return effectiveServicePrice(this.readState(),code,{tenantId:context.tenantId||context.tenant_id,communityId:context.communityId||context.community_id||context.id});}
  async list(userId){
    const rows=await this.store.all('SELECT id,tenant_id,community_id,service_code,amount_cents,mode,state,paid_until,cancelled_at,created_at,token IS NOT NULL AS has_profile,price_revision FROM cycle_subscription WHERE user_id=? ORDER BY created_at DESC',String(userId));
    return rows.map(s=>({...s,state:s.state==='REVIEW'?'REVIEW':s.paid_until&&s.paid_until<=this.now()?'EXPIRED':s.state,renewalStatus:s.cancelled_at?'Cancelled':s.price_revision!==this.price(s.service_code,s)?.revision?'Price changed - renewed consent required':!s.has_profile?'Saved payment profile pending':!this.settings().recurringReady?'Developer configuration required':'Scheduled'}));
  }
  async active(userId,communityId){return (await this.list(userId)).filter(s=>s.mode==='live'&&s.paid_until>this.now()&&['ACTIVE','CANCELLED'].includes(s.state)&&(!communityId||s.community_id===communityId)).map(s=>({id:s.id,serviceCode:memberCapabilities[s.service_code]?.native||s.service_code,communityId:s.community_id,tenantId:s.tenant_id,planCode:'configured-monthly',planLabel:serviceCatalogue[s.service_code]+' monthly',amountCents:s.amount_cents,status:'active',subscribedAt:s.created_at,paidUntil:s.paid_until,provider:'cycle'}));}
  intent(id){return this.store.get('SELECT * FROM cycle_intent WHERE request_id=?',id);}
  fulfilled(id){return this.store.get('SELECT request_id FROM cycle_fulfilment WHERE request_id=?',id);}
  async start(userId,body){
    const cfg=this.config(),settings=this.settings();if(!cfg.ready)fail(503,'Cycle Pay is awaiting developer configuration. No payment was taken.');
    const id=String(userId),key=body.idempotencyKey;if(typeof key!=='string'||!/^[a-zA-Z0-9-]{16,100}$/.test(key))fail(400,'A valid payment request key is required.');
    const purpose=body.purpose;if(!['wallet-top-up','subscription'].includes(purpose))fail(400,'Choose a wallet top-up or subscription.');
    if(body.accepted!==true)fail(400,'Accept the payment terms before continuing.');
    const code=canonicalService(body.serviceCode);
    let c=this.community(id,body.communityId);
    if(purpose==='subscription'&&!await this.serviceReady(code,c))fail(409,'The community service programme must be ready before paid enrolment.');
    try{return await this.store.tx(async()=>{
      c=this.community(id,body.communityId);
      let price,amount,description;
      if(purpose==='wallet-top-up'){
        if(!settings.topUpsEnabled)fail(503,'Cycle wallet funding has not been enabled by the developer.');
        if(!this.enabled(c,'wallet'))fail(409,'Wallet is not enabled for this tenant and community.');
        amount=body.amountCents;if(!Number.isSafeInteger(amount)||amount<100||amount>10000000)fail(400,'Choose a top-up between R1 and R100,000.');
        if(!this.readState().wallets?.some(w=>w.ownerType==='MEMBER'&&String(w.ownerId)===id))fail(409,'Your member wallet must be created before funding it.');
        description='Duranki wallet top-up';
      }else{
        if(!settings.recurringReady)fail(503,'Recurring payments are awaiting developer configuration.');
        if(!Object.hasOwn(serviceCatalogue,code)||memberCapabilities[code]?.issue)fail(409,'This service is not ready for paid enrolment.');
        if(!this.enabled(c,code))fail(403,'This service is not enabled for this tenant and community.');
        price=this.price(code,c);
        if(price?.mode!=='paid'||!Number.isSafeInteger(price.amountCents)||price.amountCents<1)fail(409,'An administrator must configure a paid monthly price.');
        if(body.priceRevision!==price.revision||body.amountCents!==price.amountCents||body.termsVersion!==billingTerms)fail(409,'The price or terms changed. Refresh and review before accepting.');
        amount=price.amountCents;description=serviceCatalogue[code]+' monthly subscription';
      }
      const existing=await this.store.get('SELECT i.*,r.amount_cents,r.community_id FROM cycle_intent i JOIN cycle_request r ON r.id=i.request_id WHERE i.user_id=? AND i.client_key=?',id,key);
      if(existing){const sub=existing.subscription_id&&await this.store.get('SELECT service_code FROM cycle_subscription WHERE id=?',existing.subscription_id);if(existing.purpose!==purpose||existing.community_id!==c.id||existing.amount_cents!==amount||(sub&&sub.service_code!==code))fail(409,'Payment key already used for another request.');return this.store.request(existing.request_id);}
      const now=this.now(),subscriptionId=purpose==='subscription'?randomUUID():null;
      if(subscriptionId)await this.store.run('INSERT INTO cycle_subscription(id,user_id,tenant_id,community_id,service_code,amount_cents,price_revision,price_snapshot,mode,consent_version,consented_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',subscriptionId,id,c.tenantId,c.id,code,amount,price.revision,JSON.stringify(price),cfg.mode,billingTerms,now,now);
      const request=await this.store.create({userId:id,tenantId:c.tenantId,communityId:c.id,description,amountCents:amount,reference:'BILL-'+randomUUID()},id,cfg.mode);
      await this.store.run('INSERT INTO cycle_intent VALUES(?,?,?,?,?,?)',request.id,purpose,subscriptionId,subscriptionId?now:null,key,id);
      await this.store.run('INSERT INTO cycle_consent VALUES(?,?,?,?,?)',request.id,id,purpose==='subscription'?billingTerms:'cycle-wallet-top-up-v1',amount,now);
      return request;
    });}catch(error){if(error.code==='ER_DUP_ENTRY')fail(409,'You already have this subscription. View or cancel it in My payments.');throw error;}
  }
  checkout(id,userId){return this.store.tx(async()=>{
    const result=await this.store.checkout(id,userId,this.config()),intent=await this.intent(id);
    if(await this.store.get('SELECT request_id FROM cycle_dispatch WHERE request_id=?',id))fail(409,'This renewal has already been submitted to Cycle.');
    if(intent?.subscription_id){
      const sub=await this.store.get('SELECT * FROM cycle_subscription WHERE id=?',intent.subscription_id);
      if(sub.cancelled_at)fail(409,'This subscription was cancelled.');
      if(!this.settings().recurringReady)fail(503,'Recurring billing is not configured.');
      const payload=JSON.parse(result.payload);payload.savePaymentProfile=true;payload.recurrence={type:'INITIAL'};
      const json=JSON.stringify(payload);return {...result,payload:json,signature:signCyclePayload(json,this.config().paywallKey)};
    }return result;
  });}
  fulfil(id,event){return this.store.tx(async()=>{
    const row=await this.store.request(id),intent=await this.intent(id);if(!intent||!row)return;
    if(row.review_required){
      if(intent.subscription_id)await this.store.run("UPDATE cycle_subscription SET state='REVIEW' WHERE id=?",intent.subscription_id);
      if(intent.purpose==='wallet-top-up'&&row.mode==='live'&&row.charged_at)await this.updateState(state=>{(state.cycleWalletReview??={})[row.user_id]=true;});
      return;
    }
    if(row.status!=='CHARGED'||await this.fulfilled(id))return;
    const now=this.now();
    if(intent.purpose==='wallet-top-up'&&row.mode==='live')await this.updateState(state=>{
      state.cycleWalletCredits??={};if(state.cycleWalletCredits[id])return;
      const wallet=state.wallets.find(w=>w.ownerType==='MEMBER'&&String(w.ownerId)===row.user_id);if(!wallet)fail(409,'Wallet allocation needs administrator review.');
      const balance=Math.round(wallet.balance*100)+row.amount_cents,available=Math.round(wallet.availableBalance*100)+row.amount_cents;
      if(!Number.isSafeInteger(balance)||!Number.isSafeInteger(available))fail(409,'Wallet allocation needs administrator review.');
      wallet.balance=balance/100;wallet.availableBalance=available/100;
      state.walletTransactions.push({id:'cycle-'+id,walletId:wallet.id,transactionType:'TOP_UP',amount:row.amount_cents/100,direction:'IN',description:'Cycle Pay verified top-up',reference:row.reference,status:'SUCCESSFUL',createdAt:now,provider:'cycle',providerId:row.provider_id});state.cycleWalletCredits[id]=true;
    });
    if(intent.subscription_id){
      const sub=await this.store.get('SELECT * FROM cycle_subscription WHERE id=?',intent.subscription_id),settings=this.settings();
      const profile=settings.profilePath?.split('.').reduce((v,k)=>Object.hasOwn(v||{},k)?v[k]:undefined,event);
      const token=typeof profile==='string'&&profile.length>0&&profile.length<=1000&&/^[a-f0-9]{64}$/i.test(settings.tokenKey)?encrypt(profile,settings.tokenKey):sub.token;
      await this.store.run('UPDATE cycle_subscription SET state=?,paid_until=?,token=? WHERE id=?',sub.cancelled_at?'CANCELLED':'ACTIVE',nextMonth(now),token,intent.subscription_id);
    }
    await this.store.run('INSERT INTO cycle_fulfilment VALUES(?,?)',id,now);
  });}
  cancel(userId,id){return this.store.tx(async()=>{
    const row=await this.store.get('SELECT id FROM cycle_subscription WHERE id=? AND user_id=?',id,String(userId));if(!row)fail(404,'Subscription not found.');
    await this.store.run("UPDATE cycle_subscription SET cancelled_at=COALESCE(cancelled_at,?),state=CASE WHEN state='REVIEW' THEN state ELSE 'CANCELLED' END,token=NULL WHERE id=?",this.now(),id);
    return {cancelled:true,message:'Future renewals cancelled. Any paid access remains until its expiry. A payment already submitted may still complete.'};
  });}
  async renewDue(){
    const cfg=this.config(),settings=this.settings();if(!cfg.ready||!settings.recurringReady)return {submitted:0};
    let submitted=0;
    const due=await this.store.all("SELECT * FROM cycle_subscription WHERE cancelled_at IS NULL AND token IS NOT NULL AND paid_until<=? AND mode=? AND state='ACTIVE'",this.now(),cfg.mode);
    for(const sub of due){
      const community=joinableCommunities(this.readState()).find(c=>c.id===sub.community_id||c.aliases?.includes(sub.community_id));
      if(!community||!await this.serviceReady(sub.service_code,community))continue;
      const row=await this.store.tx(async()=>{
        const current=await this.store.get('SELECT * FROM cycle_subscription WHERE id=?',sub.id);
        if(!current||current.cancelled_at||current.state!=='ACTIVE'||current.token!==sub.token||current.paid_until!==sub.paid_until)return null;
        if(!findMembership(this.readState(),sub.user_id,community)||!this.enabled(community,sub.service_code)||this.readState().users.find(u=>String(u.id)===sub.user_id)?.status!=='active')return null;
        if(this.price(sub.service_code,sub)?.revision!==sub.price_revision)return null;
        if(await this.store.get('SELECT request_id FROM cycle_intent WHERE subscription_id=? AND period_start=?',sub.id,sub.paid_until))return null;
        const request=await this.store.create({userId:sub.user_id,tenantId:sub.tenant_id,communityId:sub.community_id,amountCents:sub.amount_cents,description:serviceCatalogue[sub.service_code]+' renewal',reference:'RENEW-'+randomUUID()},'cycle-renewal',cfg.mode);
        await this.store.run('INSERT INTO cycle_intent VALUES(?,?,?,?,?,?)',request.id,'subscription',sub.id,sub.paid_until,randomUUID(),sub.user_id);
        await this.store.run('INSERT INTO cycle_dispatch VALUES(?,?,?)',request.id,'SUBMITTED',this.now());return request;
      });
      if(!row)continue;
      try{
        const path='/api/v3/charges',body=JSON.stringify({command:'CHARGE',id:row.id,customer:{id:sub.user_id},lineItem:{currency:'ZAR',amount:sub.amount_cents/100,description:row.description},payment:{storedPaymentProfileId:decrypt(sub.token,settings.tokenKey),countryCode:'ZA'},recurrence:{type:'RENEWAL'}}),timestamp=String(Math.floor(Date.now()/1000));
        const signature=createHmac('sha256',settings.password).update(settings.caller+cfg.merchant+timestamp+path+body).digest('hex');
        const result=await this.fetcher(settings.apiUrl+'/charges',{method:'POST',headers:{'Content-Type':'application/json','X-MerchantAccount':cfg.merchant,'X-CallerName':settings.caller,'X-HMAC-Timestamp':timestamp,'X-HMAC-Signature':signature},body,signal:AbortSignal.timeout(20000),redirect:'error'});
        await this.store.run('UPDATE cycle_dispatch SET state=? WHERE request_id=?',result.ok?'AWAITING_NOTIFICATION':'REVIEW',row.id);submitted++;
      }catch{await this.store.run("UPDATE cycle_dispatch SET state='REVIEW' WHERE request_id=?",row.id);}
    }return {submitted};
  }
}

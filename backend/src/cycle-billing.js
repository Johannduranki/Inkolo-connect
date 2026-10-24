import { randomUUID, randomBytes, createCipheriv, createDecipheriv, createHmac } from 'node:crypto';
import { canonicalService, serviceCatalogue, effectiveServicePrice, serviceEnabled } from './service-pricing.js';
import { memberCapabilities } from '../../frontend/public/member-service-catalogue.js';
import { joinableCommunities, findMembership } from './community-registration.js';
import { signCyclePayload } from './cycle-pay.js';

const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
export const billingTerms='cycle-monthly-v1';
export function billingConfig(env=process.env){
  const apiUrl=env.CYCLE_API_BASE_URL||'';
  const profilePath=env.CYCLE_PROFILE_ID_PATH||'';
  const tokenKey=env.CYCLE_TOKEN_ENCRYPTION_KEY||'';
  const recurringReady=env.CYCLE_RECURRING_ENABLED==='true' && !!env.CYCLE_API_CALLER_NAME && !!env.CYCLE_API_CALLER_PASSWORD &&
    ['https://sandbox.cyclepay.net/api/v3','https://api.cyclepay.net/api/v3'].includes(apiUrl) && /^[a-f0-9]{64}$/i.test(tokenKey) && /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)*$/.test(profilePath);
  return {apiUrl,profilePath,tokenKey,caller:env.CYCLE_API_CALLER_NAME||'',password:env.CYCLE_API_CALLER_PASSWORD||'',recurringReady,
    topUpsEnabled:env.CYCLE_WALLET_TOPUPS_ENABLED==='true'};
}
export function nextMonth(value){const date=new Date(value),day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+1);const end=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();date.setUTCDate(Math.min(day,end));return date.toISOString();}
export function encrypt(value,key){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);return [iv.toString('base64'),Buffer.concat([cipher.update(value,'utf8'),cipher.final()]).toString('base64'),cipher.getAuthTag().toString('base64')].join('.');}
export function decrypt(value,key){const [iv,data,tag]=value.split('.');const decipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),Buffer.from(iv,'base64'));decipher.setAuthTag(Buffer.from(tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(data,'base64')),decipher.final()]).toString('utf8');}

export class CycleBilling {
  constructor({store,readState,updateState,config,settings=billingConfig,fetcher=fetch,now=()=>new Date().toISOString(),serviceReady=()=>true}){
    Object.assign(this,{store,db:store.db,readState,updateState,config,settings,fetcher,now,serviceReady});
    if(store.nativeSql)return;
    this.db.exec(`CREATE TABLE IF NOT EXISTS cycle_subscription(
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL,tenant_id TEXT NOT NULL,community_id TEXT NOT NULL,service_code TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,price_revision INTEGER NOT NULL,price_snapshot TEXT NOT NULL,mode TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'PENDING',consent_version TEXT NOT NULL,consented_at TEXT NOT NULL,
      token TEXT,paid_until TEXT,cancelled_at TEXT,created_at TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS cycle_subscription_open ON cycle_subscription(user_id,community_id,service_code,mode) WHERE cancelled_at IS NULL;
      CREATE TABLE IF NOT EXISTS cycle_intent(request_id TEXT PRIMARY KEY,purpose TEXT NOT NULL,subscription_id TEXT,period_start TEXT,
        client_key TEXT NOT NULL,user_id TEXT NOT NULL,UNIQUE(user_id,client_key));
      CREATE UNIQUE INDEX IF NOT EXISTS cycle_subscription_period ON cycle_intent(subscription_id,period_start) WHERE subscription_id IS NOT NULL;
      CREATE TABLE IF NOT EXISTS cycle_fulfilment(request_id TEXT PRIMARY KEY,applied_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cycle_dispatch(request_id TEXT PRIMARY KEY,state TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cycle_consent(request_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,version TEXT NOT NULL,amount_cents INTEGER NOT NULL,accepted_at TEXT NOT NULL);`);
  }
  community(userId,id){const state=this.readState();const user=state.users.find(u=>String(u.id)===String(userId));
    if(user?.status!=='active')fail(403,'Active account required.');
    const c=joinableCommunities(state).find(c=>c.id===id||c.aliases?.includes(id));
    if(!c||!findMembership(state,userId,c))fail(403,'Join this community before making a payment.');return c;
  }
  intent(id){return this.db.prepare('SELECT * FROM cycle_intent WHERE request_id=?').get(id);}
  fulfilled(id){return this.db.prepare('SELECT request_id FROM cycle_fulfilment WHERE request_id=?').get(id);}
  enabled(community,code){return serviceEnabled(this.readState(),community,code);}
  price(code,context){return effectiveServicePrice(this.readState(),code,{tenantId:context.tenantId||context.tenant_id,communityId:context.communityId||context.community_id||context.id});}
  list(userId){return this.db.prepare('SELECT id,tenant_id,community_id,service_code,amount_cents,mode,state,paid_until,cancelled_at,created_at,token IS NOT NULL AS has_profile,price_revision FROM cycle_subscription WHERE user_id=? ORDER BY created_at DESC').all(String(userId)).map(s=>({...s,state:s.state==='REVIEW'?'REVIEW':s.paid_until&&s.paid_until<=this.now()?'EXPIRED':s.state,renewalStatus:s.cancelled_at?'Cancelled':s.price_revision!==this.price(s.service_code,s)?.revision?'Price changed - renewed consent required':!s.has_profile?'Saved payment profile pending':!this.settings().recurringReady?'Developer configuration required':'Scheduled'}));}
  active(userId,communityId){return this.list(userId).filter(s=>s.mode==='live'&&s.paid_until>this.now()&&['ACTIVE','CANCELLED'].includes(s.state)&&(!communityId||s.community_id===communityId)).map(s=>({id:s.id,serviceCode:memberCapabilities[s.service_code]?.native||s.service_code,communityId:s.community_id,tenantId:s.tenant_id,planCode:'configured-monthly',planLabel:serviceCatalogue[s.service_code]+' monthly',amountCents:s.amount_cents,status:'active',subscribedAt:s.created_at,paidUntil:s.paid_until,provider:'cycle'}));}
  async start(userId,body){
    const cfg=this.config(),settings=this.settings();if(!cfg.ready)fail(503,'Cycle Pay is awaiting developer configuration. No payment was taken.');
    const id=String(userId),key=body.idempotencyKey;if(typeof key!=='string'||!/^[a-zA-Z0-9-]{16,100}$/.test(key))fail(400,'A valid payment request key is required.');
    const c=this.community(id,body.communityId),purpose=body.purpose;
    if(!['wallet-top-up','subscription'].includes(purpose))fail(400,'Choose a wallet top-up or subscription.');
    if(body.accepted!==true)fail(400,'Accept the payment terms before continuing.');
    const code=canonicalService(body.serviceCode);
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
      if(!await this.serviceReady(code,c))fail(409,'The community service programme must be ready before paid enrolment.');
      const currentCommunity=this.community(id,body.communityId);
      if(currentCommunity.id!==c.id||currentCommunity.tenantId!==c.tenantId||!this.enabled(currentCommunity,code))fail(403,'This service is no longer enabled for your community.');
      price=this.price(code,c);
      if(price?.mode!=='paid'||!Number.isSafeInteger(price.amountCents)||price.amountCents<1)fail(409,'An administrator must configure a paid monthly price.');
      if(body.priceRevision!==price.revision||body.amountCents!==price.amountCents||body.termsVersion!==billingTerms)fail(409,'The price or terms changed. Refresh and review before accepting.');
      amount=price.amountCents;description=serviceCatalogue[code]+' monthly subscription';
    }
    const existing=this.db.prepare('SELECT i.*,r.amount_cents,r.community_id FROM cycle_intent i JOIN cycle_request r ON r.id=i.request_id WHERE i.user_id=? AND i.client_key=?').get(id,key);
    if(existing){const sub=existing.subscription_id&&this.db.prepare('SELECT service_code FROM cycle_subscription WHERE id=?').get(existing.subscription_id);if(existing.purpose!==purpose||existing.community_id!==c.id||existing.amount_cents!==amount||(sub&&sub.service_code!==code))fail(409,'Payment key already used for another request.');return this.store.get(existing.request_id);}
    const now=this.now(),subscriptionId=purpose==='subscription'?randomUUID():null;
    this.db.exec('BEGIN IMMEDIATE');try{
      if(subscriptionId)this.db.prepare('INSERT INTO cycle_subscription(id,user_id,tenant_id,community_id,service_code,amount_cents,price_revision,price_snapshot,mode,consent_version,consented_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(subscriptionId,id,c.tenantId,c.id,code,amount,price.revision,JSON.stringify(price),cfg.mode,billingTerms,now,now);
      const request=this.store.create({userId:id,tenantId:c.tenantId,communityId:c.id,description,amountCents:amount,reference:'BILL-'+randomUUID()},id,cfg.mode,true);
      this.db.prepare('INSERT INTO cycle_intent VALUES(?,?,?,?,?,?)').run(request.id,purpose,subscriptionId,subscriptionId?now:null,key,id);
      this.db.prepare('INSERT INTO cycle_consent VALUES(?,?,?,?,?)').run(request.id,id,purpose==='subscription'?billingTerms:'cycle-wallet-top-up-v1',amount,now);
      this.db.exec('COMMIT');return request;
    }catch(e){this.db.exec('ROLLBACK');if(e.message.includes('UNIQUE'))fail(409,'You already have this subscription. View or cancel it in My payments.');throw e;}
  }
  checkout(id,userId){const result=this.store.checkout(id,userId,this.config());const intent=this.db.prepare('SELECT * FROM cycle_intent WHERE request_id=?').get(id);
    if(this.db.prepare('SELECT request_id FROM cycle_dispatch WHERE request_id=?').get(id))fail(409,'This renewal has already been submitted to Cycle.');
    if(intent?.subscription_id){const sub=this.db.prepare('SELECT * FROM cycle_subscription WHERE id=?').get(intent.subscription_id);if(sub.cancelled_at)fail(409,'This subscription was cancelled.');if(!this.settings().recurringReady)fail(503,'Recurring billing is not configured.');const payload=JSON.parse(result.payload);payload.savePaymentProfile=true;payload.recurrence={type:'INITIAL'};const json=JSON.stringify(payload);return {...result,payload:json,signature:signCyclePayload(json,this.config().paywallKey)};}
    return result;
  }
  async fulfil(id,event){
    const row=this.store.get(id),intent=this.db.prepare('SELECT * FROM cycle_intent WHERE request_id=?').get(id);
    if(!intent)return;
    if(row.review_required){
      if(intent.subscription_id)this.db.prepare("UPDATE cycle_subscription SET state='REVIEW' WHERE id=?").run(intent.subscription_id);
      if(intent.purpose==='wallet-top-up'&&row.mode==='live'&&row.charged_at)await this.updateState(state=>{(state.cycleWalletReview??={})[row.user_id]=true;});
      return;
    }
    if(row?.status!=='CHARGED')return;
    if(this.db.prepare('SELECT request_id FROM cycle_fulfilment WHERE request_id=?').get(id))return;
    const now=this.now();
    if(intent.purpose==='wallet-top-up'&&row.mode==='live'){
      // The platform transaction has its own durable key: replay cannot credit twice.
      await this.updateState(state=>{state.cycleWalletCredits??={};if(state.cycleWalletCredits[id])return;
        const wallet=state.wallets.find(w=>w.ownerType==='MEMBER'&&String(w.ownerId)===row.user_id);if(!wallet)fail(409,'Wallet allocation needs administrator review.');
        wallet.balance=(Math.round(wallet.balance*100)+row.amount_cents)/100;wallet.availableBalance=(Math.round(wallet.availableBalance*100)+row.amount_cents)/100;
        state.walletTransactions.push({id:'cycle-'+id,walletId:wallet.id,transactionType:'TOP_UP',amount:row.amount_cents/100,direction:'IN',description:'Cycle Pay verified top-up',reference:row.reference,status:'SUCCESSFUL',createdAt:now,provider:'cycle',providerId:row.provider_id});state.cycleWalletCredits[id]=true;
      });
    }
    this.db.exec('BEGIN IMMEDIATE');try{
      if(this.db.prepare('SELECT request_id FROM cycle_fulfilment WHERE request_id=?').get(id)){this.db.exec('COMMIT');return;}
      if(intent.subscription_id){
        const sub=this.db.prepare('SELECT * FROM cycle_subscription WHERE id=?').get(intent.subscription_id),settings=this.settings();
        let profile=settings.profilePath?.split('.').reduce((v,k)=>Object.hasOwn(v||{},k)?v[k]:undefined,event);
        const token=typeof profile==='string'&&profile.length>0&&profile.length<=1000&&/^[a-f0-9]{64}$/i.test(settings.tokenKey)?encrypt(profile,settings.tokenKey):sub.token;
        const until=nextMonth(now);
        this.db.prepare('UPDATE cycle_subscription SET state=?,paid_until=?,token=? WHERE id=?').run(sub.cancelled_at?'CANCELLED':'ACTIVE',until,token,intent.subscription_id);
      }
      this.db.prepare('INSERT INTO cycle_fulfilment VALUES(?,?)').run(id,now);this.db.exec('COMMIT');
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  cancel(userId,id){const result=this.db.prepare("UPDATE cycle_subscription SET cancelled_at=COALESCE(cancelled_at,?),state=CASE WHEN state='REVIEW' THEN state ELSE 'CANCELLED' END,token=NULL WHERE id=? AND user_id=?").run(this.now(),id,String(userId));if(!result.changes)fail(404,'Subscription not found.');return {cancelled:true,message:'Future renewals cancelled. Any paid access remains until its expiry. A payment already submitted may still complete.'};}
  async renewDue(){
    const cfg=this.config(),settings=this.settings();if(!cfg.ready||!settings.recurringReady)return {submitted:0};
    let submitted=0;const due=this.db.prepare("SELECT * FROM cycle_subscription WHERE cancelled_at IS NULL AND token IS NOT NULL AND paid_until<=? AND mode=? AND state='ACTIVE'").all(this.now(),cfg.mode);
    for(const sub of due){
      const c=joinableCommunities(this.readState()).find(c=>c.id===sub.community_id);
      if(!c||!await this.serviceReady(sub.service_code,c))continue;
      if(!findMembership(this.readState(),sub.user_id,c)||!this.enabled(c,sub.service_code)||this.readState().users.find(u=>String(u.id)===sub.user_id)?.status!=='active')continue;
      const price=this.price(sub.service_code,sub);if(price?.revision!==sub.price_revision)continue; // Re-consent to price changes; never silently charge a new amount.
      let row;this.db.exec('BEGIN IMMEDIATE');try{
        // Eligibility checks can await SQL; cancellation must still win before dispatch.
        const current=this.db.prepare('SELECT * FROM cycle_subscription WHERE id=?').get(sub.id);
        if(!current||current.cancelled_at||current.state!=='ACTIVE'||current.token!==sub.token||current.paid_until!==sub.paid_until){this.db.exec('COMMIT');continue;}
        const existing=this.db.prepare('SELECT request_id FROM cycle_intent WHERE subscription_id=? AND period_start=?').get(sub.id,sub.paid_until);
        if(existing){this.db.exec('COMMIT');continue;}
        row=this.store.create({userId:sub.user_id,tenantId:sub.tenant_id,communityId:sub.community_id,amountCents:sub.amount_cents,description:serviceCatalogue[sub.service_code]+' renewal',reference:'RENEW-'+randomUUID()},'cycle-renewal',cfg.mode,true);
        this.db.prepare('INSERT INTO cycle_intent VALUES(?,?,?,?,?,?)').run(row.id,'subscription',sub.id,sub.paid_until,randomUUID(),sub.user_id);
        this.db.prepare('INSERT INTO cycle_dispatch VALUES(?,?,?)').run(row.id,'SUBMITTED',this.now());this.db.exec('COMMIT');
      }catch(e){this.db.exec('ROLLBACK');throw e;}
      try{
        const path='/api/v3/charges',body=JSON.stringify({command:'CHARGE',id:row.id,customer:{id:sub.user_id},lineItem:{currency:'ZAR',amount:sub.amount_cents/100,description:row.description},payment:{storedPaymentProfileId:decrypt(sub.token,settings.tokenKey),countryCode:'ZA'},recurrence:{type:'RENEWAL'}}),timestamp=String(Math.floor(Date.now()/1000));
        const signature=createHmac('sha256',settings.password).update(settings.caller+cfg.merchant+timestamp+path+body).digest('hex');
        const result=await this.fetcher(settings.apiUrl+'/charges',{method:'POST',headers:{'Content-Type':'application/json','X-MerchantAccount':cfg.merchant,'X-CallerName':settings.caller,'X-HMAC-Timestamp':timestamp,'X-HMAC-Signature':signature},body,signal:AbortSignal.timeout(20000),redirect:'error'});
        // The signed webhook is authoritative. Unknown outcomes are never retried as new charges.
        this.db.prepare('UPDATE cycle_dispatch SET state=? WHERE request_id=?').run(result.ok?'AWAITING_NOTIFICATION':'REVIEW',row.id);submitted++;
      }catch{this.db.prepare("UPDATE cycle_dispatch SET state='REVIEW' WHERE request_id=?").run(row.id);}
    }return {submitted};
  }
}

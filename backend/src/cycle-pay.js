import { DatabaseSync } from 'node:sqlite';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export const cycleUrls={sandbox:'https://sandbox.cyclepay.net/pwv4/launch',live:'https://payment.cyclepay.net/pwv4/launch'};
export function cycleConfig(env=process.env){
  const mode=env.CYCLE_MODE==='live'?'live':'sandbox';
  const config={mode,merchant:env.CYCLE_MERCHANT_ACCOUNT||'Duranki',paywallKey:env.CYCLE_PAYWALL_SECRET||'',notificationKey:env.CYCLE_NOTIFICATION_SECRET||'',publicUrl:env.CYCLE_PUBLIC_URL||'',enabled:env.CYCLE_ENABLED==='true',liveApproved:env.CYCLE_LIVE_APPROVED==='true'};
  const blockers=[];
  if(!config.enabled)blockers.push('Payment collection is disabled.');
  if(!config.paywallKey)blockers.push('Paywall secret is not configured.');
  if(!config.notificationKey)blockers.push('Notification secret is not configured.');
  try{const url=new URL(config.publicUrl);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(url.hostname))throw Error();config.publicUrl=url.origin;}catch{blockers.push('A public HTTPS origin is required.');}
  if(mode==='live'&&!config.liveApproved)blockers.push('Live collection has not been approved after sandbox testing.');
  return {...config,blockers,ready:blockers.length===0,launchUrl:cycleUrls[mode]};
}
export function publicCycleConfig(config){return {provider:'Cycle Pay',merchant:config.merchant,mode:config.mode,ready:config.ready,blockers:config.blockers,launchUrl:config.launchUrl,callbackUrl:config.publicUrl?config.publicUrl+'/api/cycle/notifications':null,paywallSecretConfigured:!!config.paywallKey,notificationSecretConfigured:!!config.notificationKey};}
export function signCyclePayload(payload,key){return createHash('sha256').update(key+payload,'utf8').digest('hex');}
export function validCycleSignature(raw,signature,key){
  if(!key||!Buffer.isBuffer(raw)||typeof signature!=='string'||!/^[a-f0-9]{64}$/i.test(signature))return false;
  return timingSafeEqual(Buffer.from(signature,'hex'),createHmac('sha256',key).update(raw).digest());
}
function cents(value){const n=Number(value);if(!['string','number'].includes(typeof value)||String(value).trim()===''||!Number.isFinite(n)||n<0||!Number.isSafeInteger(Math.round(n*100))||Math.abs(n*100-Math.round(n*100))>0.000001)fail(400,'Invalid payment amount.');return Math.round(n*100);}

export class CycleStore {
  constructor(filename){
    this.db=new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS cycle_request(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,tenant_id TEXT NOT NULL,community_id TEXT NOT NULL,description TEXT NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents>0),currency TEXT NOT NULL DEFAULT 'ZAR',mode TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',review_required INTEGER NOT NULL DEFAULT 0,provider_id TEXT UNIQUE,reference TEXT NOT NULL UNIQUE,created_by TEXT NOT NULL,created_at TEXT NOT NULL,charged_at TEXT);
      CREATE TABLE IF NOT EXISTS cycle_event(hash TEXT PRIMARY KEY,request_id TEXT NOT NULL,status TEXT NOT NULL,received_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cycle_audit(id INTEGER PRIMARY KEY,request_id TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,created_at TEXT NOT NULL);`);
  }
  get(id){return this.db.prepare('SELECT * FROM cycle_request WHERE id=?').get(id);}
  tenantCharges(tenantId){return this.db.prepare('SELECT * FROM cycle_request WHERE tenant_id=?').all(tenantId);}
  list(userId,tenantId){const conditions=[],args=[];if(userId){conditions.push('user_id=?');args.push(String(userId));}if(tenantId){conditions.push('tenant_id=?');args.push(String(tenantId));}return this.db.prepare('SELECT * FROM cycle_request'+(conditions.length?' WHERE '+conditions.join(' AND '):'')+' ORDER BY created_at DESC LIMIT 500').all(...args);}
  summary(tenantId){return this.db.prepare("SELECT currency,mode,COUNT(*) AS total,SUM(CASE WHEN status='CHARGED' THEN amount_cents ELSE 0 END) AS charged_cents,SUM(CASE WHEN status='PENDING' THEN amount_cents ELSE 0 END) AS pending_cents,SUM(review_required) AS review_count FROM cycle_request"+(tenantId?' WHERE tenant_id=?':'')+" GROUP BY currency,mode").all(...(tenantId?[String(tenantId)]:[]));}
  create(input,actor,mode,inTransaction=false){
    if(!Number.isSafeInteger(input.amountCents)||input.amountCents<=0||input.amountCents>100000000)fail(400,'Enter an amount between R0.01 and R1,000,000.');
    for(const field of ['userId','tenantId','communityId','description','reference'])if(typeof input[field]!=='string'||!input[field].trim()||input[field].length>200)fail(400,'Complete the member, community, description and unique reference.');
    const id=randomUUID(),now=new Date().toISOString();
    if(!inTransaction)this.db.exec('BEGIN IMMEDIATE');
    try{
      this.db.prepare('INSERT INTO cycle_request(id,user_id,tenant_id,community_id,description,amount_cents,mode,reference,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,input.userId,input.tenantId,input.communityId,input.description.trim(),input.amountCents,mode,input.reference.trim(),String(actor),now);
      this.db.prepare('INSERT INTO cycle_audit(request_id,actor,action,created_at) VALUES(?,?,?,?)').run(id,String(actor),'REQUEST_CREATED',now);
      if(!inTransaction)this.db.exec('COMMIT');return this.get(id);
    }catch(error){if(!inTransaction)this.db.exec('ROLLBACK');if(error.message.includes('UNIQUE'))fail(409,'This reference already exists.');throw error;}
  }
  checkout(id,userId,config){
    if(!config.ready)fail(503,'Cycle payment collection is not ready. Contact the platform administrator.');
    const row=this.get(id);if(!row||row.user_id!==String(userId))fail(404,'Payment request not found.');
    if(row.status!=='PENDING'||row.review_required||row.mode!==config.mode)fail(409,'This request is not available for payment.');
    const payload=JSON.stringify({merchantAccount:config.merchant,timestamp:Math.floor(Date.now()/1000),chargeId:row.id,price:(row.amount_cents/100).toFixed(2),currency:row.currency,description:row.description,customerId:row.user_id,customerCountry:'ZA',customerLocale:'en_ZA',mode:'DEEP_LINK',paymentMethod:'CREDIT_CARD',callbackUrl:config.publicUrl+'/api/cycle/notifications',flowCompletionUrl:config.publicUrl+'/payments/cycle?requestId='+row.id});
    return {action:config.launchUrl,payload,signature:signCyclePayload(payload,config.paywallKey)};
  }
  notify(raw,signature,config){
    if(!validCycleSignature(raw,signature,config.notificationKey))fail(403,'Invalid callback signature.');
    let event;try{event=JSON.parse(raw.toString('utf8'));}catch{fail(400,'Invalid callback JSON.');}
    if(!event||typeof event.id!=='string'||typeof event.status!=='string'||event.status.length>80)fail(400,'Invalid notification.');
    const row=this.get(event.id);if(!row)fail(404,'Unknown payment reference.');
    if(event.merchantAccount!==config.merchant||row.mode!==config.mode||event.lineItem?.currency!==row.currency||cents(event.lineItem?.amount)!==row.amount_cents)fail(409,'Payment details do not match the original request.');
    const hash=createHash('sha256').update(raw).digest('hex');
    this.db.exec('BEGIN IMMEDIATE');
    try{
      if(this.db.prepare('SELECT hash FROM cycle_event WHERE hash=?').get(hash)){this.db.exec('COMMIT');return {ok:true,duplicate:true};}
      if(event.status==='CHARGED'){
        if(typeof event.internalId!=='string'||!event.internalId||event.internalId.length>200||(event.amountRemaining!==undefined&&cents(event.amountRemaining)!==0)||!Array.isArray(event.transactions)||!event.transactions.some(tx=>tx.type==='CHARGE'&&tx.state==='APPROVED'&&tx.currency===row.currency&&cents(tx.amount)===row.amount_cents))fail(409,'A complete approved charge is required.');
        if(row.provider_id&&row.provider_id!==event.internalId)fail(409,'Conflicting provider transaction.');
        this.db.prepare("UPDATE cycle_request SET status='CHARGED',provider_id=?,charged_at=COALESCE(charged_at,?) WHERE id=?").run(event.internalId,new Date().toISOString(),row.id);
        if(event.transactions.some(tx=>['REFUND','CHARGEBACK'].includes(tx.type)))this.db.prepare('UPDATE cycle_request SET review_required=1 WHERE id=?').run(row.id);
      }else if(!['CHARGE_PENDING','AUTHORIZE_PENDING','AUTHORIZED'].includes(event.status)){
        // Refunds, partial charges and failures need review; never create a credit.
        this.db.prepare('UPDATE cycle_request SET review_required=1 WHERE id=?').run(row.id);
      }
      this.db.prepare('INSERT INTO cycle_event VALUES(?,?,?,?)').run(hash,row.id,event.status,new Date().toISOString());
      this.db.prepare('INSERT INTO cycle_audit(request_id,actor,action,created_at) VALUES(?,?,?,?)').run(row.id,'cycle-webhook',event.status,new Date().toISOString());
      this.db.exec('COMMIT');return {ok:true};
    }catch(error){this.db.exec('ROLLBACK');if(error.message.includes('UNIQUE'))fail(409,'Provider transaction already recorded.');throw error;}
  }
}

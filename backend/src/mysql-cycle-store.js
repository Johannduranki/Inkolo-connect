import {createHash,randomUUID} from 'node:crypto';
import {MysqlServiceStore} from './mysql-service-store.js';
import {signCyclePayload,validCycleSignature} from './cycle-pay.js';
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
function cents(value){const n=Number(value);if(!['string','number'].includes(typeof value)||String(value).trim()===''||!Number.isFinite(n)||n<0||!Number.isSafeInteger(Math.round(n*100))||Math.abs(n*100-Math.round(n*100))>0.000001)fail(400,'Invalid payment amount.');return Math.round(n*100);}

export class MysqlCycleStore extends MysqlServiceStore {
  constructor(pool){super(pool,'cycle');}
  request(id){return this.get('SELECT * FROM cycle_request WHERE id=?',id);}
  list(userId,tenantId){const conditions=[],args=[];if(userId){conditions.push('user_id=?');args.push(String(userId));}if(tenantId){conditions.push('tenant_id=?');args.push(String(tenantId));}return this.all('SELECT * FROM cycle_request'+(conditions.length?' WHERE '+conditions.join(' AND '):'')+' ORDER BY created_at DESC LIMIT 500',...args);}
  tenantCharges(tenantId){return this.all('SELECT * FROM cycle_request WHERE tenant_id=?',tenantId);}
  summary(tenantId){return this.all("SELECT currency,mode,COUNT(*) AS total,SUM(CASE WHEN status='CHARGED' THEN amount_cents ELSE 0 END) AS charged_cents,SUM(CASE WHEN status='PENDING' THEN amount_cents ELSE 0 END) AS pending_cents,SUM(review_required) AS review_count FROM cycle_request"+(tenantId?' WHERE tenant_id=?':'')+' GROUP BY currency,mode',...(tenantId?[tenantId]:[])).then(rows=>rows.map(r=>({...r,total:Number(r.total),charged_cents:Number(r.charged_cents),pending_cents:Number(r.pending_cents),review_count:Number(r.review_count)})));}
  async create(input,actor,mode){
    if(!Number.isSafeInteger(input.amountCents)||input.amountCents<=0||input.amountCents>100000000)fail(400,'Enter an amount between R0.01 and R1,000,000.');
    for(const field of ['userId','tenantId','communityId','description','reference'])if(typeof input[field]!=='string'||!input[field].trim()||input[field].length>200)fail(400,'Complete the member, community, description and unique reference.');
    try{return await this.tx(async()=>{
      const id=randomUUID(),now=new Date().toISOString();
      await this.run('INSERT INTO cycle_request(id,user_id,tenant_id,community_id,description,amount_cents,mode,reference,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',id,input.userId,input.tenantId,input.communityId,input.description.trim(),input.amountCents,mode,input.reference.trim(),String(actor),now);
      await this.audit(id,String(actor),'REQUEST_CREATED',now);return this.request(id);
    });}catch(error){if(error.code==='ER_DUP_ENTRY')fail(409,'This reference already exists.');throw error;}
  }
  audit(id,actor,action,at=new Date().toISOString()){return this.run('INSERT INTO cycle_audit(request_id,actor,action,created_at) VALUES(?,?,?,?)',id,actor,action,at);}
  async checkout(id,userId,config){
    if(!config.ready)fail(503,'Cycle payment collection is not ready. Contact the platform administrator.');
    const row=await this.request(id);if(!row||row.user_id!==String(userId))fail(404,'Payment request not found.');
    if(row.status!=='PENDING'||row.review_required||row.mode!==config.mode)fail(409,'This request is not available for payment.');
    const payload=JSON.stringify({merchantAccount:config.merchant,timestamp:Math.floor(Date.now()/1000),chargeId:row.id,price:(row.amount_cents/100).toFixed(2),currency:row.currency,description:row.description,customerId:row.user_id,customerCountry:'ZA',customerLocale:'en_ZA',mode:'DEEP_LINK',paymentMethod:'CREDIT_CARD',callbackUrl:config.publicUrl+'/api/cycle/notifications',flowCompletionUrl:config.publicUrl+'/payments/cycle?requestId='+row.id});
    return {action:config.launchUrl,payload,signature:signCyclePayload(payload,config.paywallKey)};
  }
  async notify(raw,signature,config){
    if(!validCycleSignature(raw,signature,config.notificationKey))fail(403,'Invalid callback signature.');
    let event;try{event=JSON.parse(raw.toString('utf8'));}catch{fail(400,'Invalid callback JSON.');}
    if(!event||typeof event.id!=='string'||typeof event.status!=='string'||event.status.length>80)fail(400,'Invalid notification.');
    try{return await this.tx(async()=>{
      const row=await this.request(event.id);if(!row)fail(404,'Unknown payment reference.');
      if(event.merchantAccount!==config.merchant||row.mode!==config.mode||event.lineItem?.currency!==row.currency||cents(event.lineItem?.amount)!==row.amount_cents)fail(409,'Payment details do not match the original request.');
      const hash=createHash('sha256').update(raw).digest('hex');
      if(await this.get('SELECT hash FROM cycle_event WHERE hash=?',hash))return {ok:true,duplicate:true};
      if(event.status==='CHARGED'){
        if(typeof event.internalId!=='string'||!event.internalId||event.internalId.length>200||(event.amountRemaining!==undefined&&cents(event.amountRemaining)!==0)||!Array.isArray(event.transactions)||!event.transactions.some(tx=>tx.type==='CHARGE'&&tx.state==='APPROVED'&&tx.currency===row.currency&&cents(tx.amount)===row.amount_cents))fail(409,'A complete approved charge is required.');
        if(row.provider_id&&row.provider_id!==event.internalId)fail(409,'Conflicting provider transaction.');
        await this.run("UPDATE cycle_request SET status='CHARGED',provider_id=?,charged_at=COALESCE(charged_at,?) WHERE id=?",event.internalId,new Date().toISOString(),row.id);
        if(event.transactions.some(tx=>['REFUND','CHARGEBACK'].includes(tx.type)))await this.run('UPDATE cycle_request SET review_required=1 WHERE id=?',row.id);
      }else if(!['CHARGE_PENDING','AUTHORIZE_PENDING','AUTHORIZED'].includes(event.status))await this.run('UPDATE cycle_request SET review_required=1 WHERE id=?',row.id);
      await this.run('INSERT INTO cycle_event VALUES(?,?,?,?)',hash,row.id,event.status,new Date().toISOString());
      await this.audit(row.id,'cycle-webhook',event.status);return {ok:true};
    });}catch(error){if(error.code==='ER_DUP_ENTRY')fail(409,'Provider transaction already recorded.');throw error;}
  }
}

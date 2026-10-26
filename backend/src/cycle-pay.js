import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

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
export { MysqlCycleStore as CycleStore } from './mysql-cycle-store.js';

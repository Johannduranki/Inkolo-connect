import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

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

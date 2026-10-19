import { createHash } from 'node:crypto';
import { platformAdmin } from './tenant-access.js';

const contactFields=['address','city','postalCode','emergencyContactName','emergencyContactNumber'];
export function profileVersion(user,profile){
  return createHash('sha256').update(JSON.stringify([user.firstName,user.lastName,user.telephoneNumber,user.email,...contactFields.map(k=>profile?.[k]||'')])).digest('hex');
}
export function editAdminProfile(state,id,input,actor){
  const fail=(status,message)=>{const error=new Error(message);error.status=status;throw error;};
  if(!platformAdmin(state.users.find(user=>String(user.id)===String(actor))))fail(403,'Platform administrator access is required.');
  const user=state.users.find(u=>String(u.id)===String(id));
  if(!user)fail(404,'User not found.');
  const profile=state.profiles.find(p=>String(p.userId)===String(id));
  if(input.version!==profileVersion(user,profile))fail(409,'This profile changed. Close and reopen it before saving.');
  const values={};
  for(const key of ['firstName','lastName','telephoneNumber','email',...contactFields]){
    if(typeof input[key]!=='string')fail(400,'Complete all profile fields.');
    values[key]=input[key].trim();
    if(values[key].length>(key==='address'?500:150))fail(400,'One of the fields is too long.');
  }
  if(!values.firstName||!values.lastName)fail(400,'Name and surname are required.');
  const normalize=value=>{const digits=value.replace(/\D/g,'');return digits.startsWith('27')&&digits.length===11?'0'+digits.slice(2):digits;};
  values.telephoneNumber=normalize(values.telephoneNumber);
  if(!/^0\d{9}$/.test(values.telephoneNumber))fail(400,'Enter a valid South African telephone number.');
  if(values.telephoneNumber!==user.telephoneNumber&&state.users.some(u=>u.id!==user.id&&normalize(String(u.telephoneNumber||''))===values.telephoneNumber))fail(409,'This telephone number belongs to another account.');
  if(String(user.id)==='1000001'&&values.telephoneNumber!==user.telephoneNumber)fail(400,'The platform owner login number cannot be changed here.');
  if(values.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))fail(400,'Enter a valid email address.');
  const changedFields=Object.keys(values).filter(k=>values[k]!==String((contactFields.includes(k)?profile?.[k]:user[k])||''));
  for(const key of ['firstName','lastName','telephoneNumber','email'])user[key]=values[key];
  const target=profile||{userId:user.id};
  for(const key of contactFields)target[key]=values[key];
  target.telephoneNumber=values.telephoneNumber;target.email=values.email;
  if(!profile)state.profiles.push(target);
  user.updatedAt=new Date().toISOString();
  state.profileAudit ||= [];
  state.profileAudit.push({userId:user.id,actorId:String(actor),changedFields,at:user.updatedAt});
  return {version:profileVersion(user,target)};
}

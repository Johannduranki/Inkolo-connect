// SA identity numbers encode YYMMDD. Prefer an explicitly recorded birth date.
export function identityBirthDate(value,now=new Date()){
 if(typeof value!=='string')return '';
 const id=value.trim();
 if(!/^\d{13}$/.test(id))return '';
 let sum=0;
 for(let i=0;i<id.length;i++){let digit=Number(id[i]);if(i%2===1){digit*=2;if(digit>9)digit-=9;}sum+=digit;}
 if(sum%10!==0)return '';
 const yearPart=Number(id.slice(0,2)),month=Number(id.slice(2,4)),day=Number(id.slice(4,6));
 const today=now.toISOString().slice(0,10);
 // Use the most recent non-future century; explicit profile dates resolve centenarians.
 for(const year of [2000+yearPart,1900+yearPart]){
  const iso=`${year}-${id.slice(2,4)}-${id.slice(4,6)}`;
  const date=new Date(Date.UTC(year,month-1,day));
  if(date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day&&iso<=today)return iso;
 }
 return '';
}

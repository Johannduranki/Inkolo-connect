import { compare } from 'bcryptjs';
export async function verifyImportedPassword(password,hash){
  if(typeof password!=='string'||!password||password.length>1024||typeof hash!=='string'||!/^\$2[aby]\$\d\d\$/.test(hash))return false;
  try{return await compare(password,hash);}catch{return false;}
}

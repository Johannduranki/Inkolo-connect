import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { authenticator } from '@otplib/v12-adapter';

export const needsMfa = user => !!user && (user.roles || []).some(role => !['member','community_member','community member'].includes(String(role).toLowerCase()));
const digest = value => createHash('sha256').update(value).digest('hex');

export class MfaStore {
  constructor(filename, keyFile, testKey) {
    if (testKey) this.key=testKey;
    else {
      if (!existsSync(keyFile)) {
        if (existsSync(filename)) throw new Error('MFA encryption key missing. Restore it from a secure backup.');
        writeFileSync(keyFile,randomBytes(32),{flag:'wx',mode:0o600});
      }
      this.key=readFileSync(keyFile);
    }
    if(this.key.length!==32)throw new Error('Invalid MFA encryption key.');
    this.db=new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS credential(user_id TEXT PRIMARY KEY, secret TEXT NOT NULL, version TEXT NOT NULL,
        last_step INTEGER NOT NULL, recovery TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS challenge(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, pending_secret TEXT, claims TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS mfa_audit(id INTEGER PRIMARY KEY,user_id TEXT NOT NULL,event TEXT NOT NULL,created_at TEXT NOT NULL);`);
  }
  get(sql,...args){return this.db.prepare(sql).get(...args);}
  run(sql,...args){return this.db.prepare(sql).run(...args);}
  seal(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);return Buffer.concat([iv,cipher.update(value,'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64');}
  open(value){const b=Buffer.from(value,'base64'),decipher=createDecipheriv('aes-256-gcm',this.key,b.subarray(0,12));decipher.setAuthTag(b.subarray(-16));return Buffer.concat([decipher.update(b.subarray(12,-16)),decipher.final()]).toString('utf8');}
  audit(id,event){this.run('INSERT INTO mfa_audit(user_id,event,created_at) VALUES(?,?,?)',String(id),event,new Date().toISOString());}
  credential(id){return this.get('SELECT * FROM credential WHERE user_id=?',String(id));}
  challenge(id){const row=this.get('SELECT * FROM challenge WHERE id=?',id);if(!row||row.expires<Date.now()||row.attempts>=5)throw new Error('Verification expired or too many attempts. Sign in again.');return row;}
  begin(userId,claims={}) {
    const id=randomUUID();
    this.run('DELETE FROM challenge WHERE expires<? OR user_id=?',Date.now(),String(userId));
    this.run('INSERT INTO challenge(id,user_id,expires,claims) VALUES(?,?,?,?)',id,String(userId),Date.now()+600000,JSON.stringify(claims));
    return id;
  }
  setup(id) {
    const row=this.challenge(id);
    if(this.credential(row.user_id))throw new Error('Google Authenticator is already configured. Enter its code or a recovery code.');
    const secret=row.pending_secret?this.open(row.pending_secret):authenticator.generateSecret();
    if(!row.pending_secret)this.run('UPDATE challenge SET pending_secret=? WHERE id=?',this.seal(secret),id);
    return {secret,uri:authenticator.keyuri(row.user_id,'Duranki',secret)};
  }
  verify(id,code) {
    const row=this.challenge(id);
    this.run('UPDATE challenge SET attempts=attempts+1 WHERE id=?',id);
    const credential=this.credential(row.user_id),encrypted=credential?.secret||row.pending_secret;
    if(!encrypted)throw new Error('Set up Google Authenticator first.');
    const otp=authenticator.create({window:1});
    const step=Math.floor(Date.now()/30000);
    const delta=/^\d{6}$/.test(code)?otp.checkDelta(code,this.open(encrypted)):null;
    const recovery=credential?JSON.parse(credential.recovery):[];
    const hash=digest(code.toUpperCase());
    const recoveryIndex=recovery.indexOf(hash);
    if(!(delta!==null && step+delta>(credential?.last_step??-1)) && recoveryIndex<0){this.audit(row.user_id,'FAILED_VERIFICATION');throw new Error('Invalid or already-used code.');}
    const codes=credential?[]:Array.from({length:8},()=>randomBytes(10).toString('hex').toUpperCase());
    const version=credential?.version||randomUUID();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if(!this.get('SELECT id FROM challenge WHERE id=?',id))throw new Error('Verification already completed. Sign in again.');
      const current=this.credential(row.user_id);
      if(credential && (!current || current.version!==credential.version || (recoveryIndex<0 && current.last_step>=step+delta) || (recoveryIndex>=0 && !JSON.parse(current.recovery).includes(hash))))throw new Error('This code has already been used.');
      if(!credential && current)throw new Error('Authenticator is already configured. Sign in again.');
      if(credential){
        if(recoveryIndex>=0){this.run('UPDATE credential SET recovery=? WHERE user_id=?',JSON.stringify(JSON.parse(current.recovery).filter(code=>code!==hash)),row.user_id);}
        else this.run('UPDATE credential SET last_step=? WHERE user_id=?',step+delta,row.user_id);
      }else this.run('INSERT INTO credential VALUES(?,?,?,?,?)',row.user_id,encrypted,version,step+delta,JSON.stringify(codes.map(digest)));
      this.run('DELETE FROM challenge WHERE id=?',id);
      this.audit(row.user_id,credential?(recoveryIndex>=0?'RECOVERY_USED':'VERIFIED'):'ENROLLED');
      this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
    return {userId:row.user_id,claims:JSON.parse(row.claims),version,recoveryCodes:codes};
  }
  allowed(user,claims){if(!needsMfa(user))return true;const record=this.credential(user.id);return !!record && claims.mfa===record.version && Number.isFinite(claims.mfaAt);}
}

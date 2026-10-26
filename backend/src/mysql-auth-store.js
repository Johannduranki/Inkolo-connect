import {randomBytes,randomUUID,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {authenticator} from '@otplib/v12-adapter';
import {needsMfa} from './mfa.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const invalid = message => Object.assign(new Error(message), {status:400});
const expired = () => invalid('Verification expired or too many attempts. Sign in again.');

export class MysqlSessionStore {
  constructor(pool,now=()=>Date.now()) {this.pool=pool;this.now=now;}
  async register(claims) {
    await this.pool.execute('INSERT INTO duranki_auth_session(jti,user_id,expires_at,last_seen) VALUES(?,?,?,?)',[claims.jti,String(claims.sub),claims.exp*1000,this.now()]);
  }
  async allowed(claims,touch=true) {
    const now=this.now();
    if(touch){
      const [result]=await this.pool.execute('UPDATE duranki_auth_session SET last_seen=GREATEST(last_seen,?) WHERE jti=? AND user_id=? AND revoked=0 AND expires_at>? AND last_seen>?',[now,claims.jti,String(claims.sub),now,now-30*60*1000]);
      return result.affectedRows===1;
    }
    const [rows]=await this.pool.execute('SELECT jti FROM duranki_auth_session WHERE jti=? AND user_id=? AND revoked=0 AND expires_at>? AND last_seen>?',[claims.jti,String(claims.sub),now,now-30*60*1000]);
    return rows.length===1;
  }
  async revoke(jti) {await this.pool.execute('UPDATE duranki_auth_session SET revoked=1 WHERE jti=?',[jti]);}
  async revokeUser(userId) {await this.pool.execute('UPDATE duranki_auth_session SET revoked=1 WHERE user_id=?',[String(userId)]);}
}

export class MysqlMfaStore {
  constructor(pool,_keyFile,testKey) {
    this.pool=pool;
    if (testKey !== undefined) {
      if (!Buffer.isBuffer(testKey) || testKey.length !== 32) throw Error('Invalid MFA encryption key.');
      this.key=Buffer.from(testKey);
    } else {
      const encoded=process.env.MFA_ENCRYPTION_KEY;
      if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw Error('MFA_ENCRYPTION_KEY must be canonical base64 encoding of 32 bytes.');
      this.key=Buffer.from(encoded,'base64');
      if (this.key.length !== 32 || this.key.toString('base64') !== encoded) throw Error('MFA_ENCRYPTION_KEY must be canonical base64 encoding of 32 bytes.');
    }
  }
  async ready() {
    const [rows]=await this.pool.execute('SELECT key_sha256 FROM duranki_auth_migration WHERE id=1');
    if(rows.length!==1||rows[0].key_sha256!==hash(this.key))throw Error('Authentication storage must be initialized with the matching MFA key.');
  }
  seal(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);return Buffer.concat([iv,cipher.update(value,'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64');}
  open(value){const bytes=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',this.key,bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(-16));return Buffer.concat([cipher.update(bytes.subarray(12,-16)),cipher.final()]).toString('utf8');}
  async credential(id,connection=this.pool) {const [rows]=await connection.execute('SELECT * FROM duranki_mfa_credential WHERE user_id=?',[String(id)]);return rows[0];}
  async challenge(id,connection=this.pool) {
    const [rows]=await connection.execute('SELECT * FROM duranki_mfa_challenge WHERE id=?',[id]);
    const row=rows[0];if(!row||Number(row.expires)<=Date.now()||row.attempts>=5)throw expired();
    return row;
  }
  async audit(connection,userId,event) {await connection.execute('INSERT INTO duranki_mfa_audit(user_id,event,created_at) VALUES(?,?,?)',[String(userId),event,new Date().toISOString()]);}
  async locked(userId,work) {
    const connection=await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      // Lock an identity even before enrolment, so concurrent setup/verification cannot create two credentials.
      await connection.execute('INSERT IGNORE INTO duranki_auth_identity(user_id) VALUES(?)',[String(userId)]);
      await connection.execute('SELECT user_id FROM duranki_auth_identity WHERE user_id=? FOR UPDATE',[String(userId)]);
      const result=await work(connection);
      await connection.commit();return result;
    }catch(error){await connection.rollback();throw error;}finally{connection.release();}
  }
  async begin(userId,claims={}) {
    return this.locked(userId,async connection=>{
      const id=randomUUID();
      await connection.execute('DELETE FROM duranki_mfa_challenge WHERE user_id=?',[String(userId)]);
      await connection.execute('INSERT INTO duranki_mfa_challenge(id,user_id,expires,claims) VALUES(?,?,?,?)',[id,String(userId),Date.now()+600000,JSON.stringify(claims)]);
      return id;
    });
  }
  async setup(id) {
    const initial=await this.challenge(id);
    return this.locked(initial.user_id,async connection=>{
      const row=await this.challenge(id,connection);
      if(await this.credential(row.user_id,connection))throw invalid('Google Authenticator is already configured. Enter its code or a recovery code.');
      const secret=row.pending_secret?this.open(row.pending_secret):authenticator.generateSecret();
      if(!row.pending_secret)await connection.execute('UPDATE duranki_mfa_challenge SET pending_secret=? WHERE id=?',[this.seal(secret),id]);
      return {secret,uri:authenticator.keyuri(row.user_id,'Duranki',secret)};
    });
  }
  async verify(id,code) {
    if(typeof code!=='string'||code.length>40)throw invalid('Enter the authenticator code or a recovery code.');
    const initial=await this.challenge(id);
    const result=await this.locked(initial.user_id,async connection=>{
      const row=await this.challenge(id,connection);
      await connection.execute('UPDATE duranki_mfa_challenge SET attempts=attempts+1 WHERE id=?',[id]);
      const credential=await this.credential(row.user_id,connection),encrypted=credential?.secret||row.pending_secret;
      if(!encrypted)return {error:invalid('Set up Google Authenticator first.')};
      const step=Math.floor(Date.now()/30000);
      const delta=/^\d{6}$/.test(code)?authenticator.create({window:1}).checkDelta(code,this.open(encrypted)):null;
      const recovery=credential?JSON.parse(credential.recovery):[];
      const codeHash=hash(code.toUpperCase()), recoveryUsed=recovery.includes(codeHash);
      if(!(delta!==null&&step+delta>Number(credential?.last_step??-1))&&!recoveryUsed){
        await this.audit(connection,row.user_id,'FAILED_VERIFICATION');
        // Commit failed-attempt accounting rather than rolling it back with the rejected code.
        return {error:invalid('Invalid or already-used code.')};
      }
      const codes=credential?[]:Array.from({length:8},()=>randomBytes(10).toString('hex').toUpperCase());
      const version=credential?.version||randomUUID();
      if(credential){
        if(recoveryUsed)await connection.execute('UPDATE duranki_mfa_credential SET recovery=? WHERE user_id=?',[JSON.stringify(recovery.filter(value=>value!==codeHash)),row.user_id]);
        else await connection.execute('UPDATE duranki_mfa_credential SET last_step=? WHERE user_id=?',[step+delta,row.user_id]);
      }else await connection.execute('INSERT INTO duranki_mfa_credential(user_id,secret,version,last_step,recovery) VALUES(?,?,?,?,?)',[row.user_id,encrypted,version,step+delta,JSON.stringify(codes.map(hash))]);
      await connection.execute('DELETE FROM duranki_mfa_challenge WHERE id=?',[id]);
      await this.audit(connection,row.user_id,credential?(recoveryUsed?'RECOVERY_USED':'VERIFIED'):'ENROLLED');
      return {userId:row.user_id,claims:JSON.parse(row.claims),version,recoveryCodes:codes};
    });
    if(result.error)throw result.error;
    return result;
  }
  async allowed(user,claims) {if(!needsMfa(user))return true;const row=await this.credential(user.id);return !!row&&claims.mfa===row.version&&Number.isFinite(claims.mfaAt);}
}

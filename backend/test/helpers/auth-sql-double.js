// In-memory SQL protocol double; unexpected statements fail instead of reaching a database.
export function authSqlDouble() {
  const credentials=new Map(),challenges=new Map(),sessions=new Map(),audit=[];
  const pool={credentials,challenges,sessions,audit,metadata:[],async execute(sql,args=[]){
    const [a,b,c,d,e]=args;
    if(sql==='SELECT key_sha256 FROM duranki_auth_migration WHERE id=1')return [pool.metadata];
    if(sql.startsWith('INSERT IGNORE INTO duranki_auth_identity'))return [{affectedRows:1}];
    if(sql.startsWith('SELECT user_id FROM duranki_auth_identity'))return [[{user_id:a}]];
    if(sql.startsWith('SELECT * FROM duranki_mfa_credential'))return [[credentials.get(a)].filter(Boolean)];
    if(sql.startsWith('SELECT * FROM duranki_mfa_challenge'))return [[challenges.get(a)].filter(Boolean)];
    if(sql.startsWith('DELETE FROM duranki_mfa_challenge WHERE user_id=')){
      for(const [id,row] of challenges)if(row.user_id===a)challenges.delete(id);
      return [{affectedRows:1}];
    }
    if(sql.startsWith('DELETE FROM duranki_mfa_challenge WHERE id=')){challenges.delete(a);return [{affectedRows:1}];}
    if(sql.startsWith('INSERT INTO duranki_mfa_challenge')){challenges.set(a,{id:a,user_id:b,expires:c,claims:d,attempts:0,pending_secret:null});return [{affectedRows:1}];}
    if(sql.startsWith('UPDATE duranki_mfa_challenge SET pending_secret=')){challenges.get(b).pending_secret=a;return [{affectedRows:1}];}
    if(sql.startsWith('UPDATE duranki_mfa_challenge SET attempts=')){challenges.get(a).attempts++;return [{affectedRows:1}];}
    if(sql.startsWith('INSERT INTO duranki_mfa_credential')){credentials.set(a,{user_id:a,secret:b,version:c,last_step:d,recovery:e});return [{affectedRows:1}];}
    if(sql.startsWith('UPDATE duranki_mfa_credential SET recovery=')){credentials.get(b).recovery=a;return [{affectedRows:1}];}
    if(sql.startsWith('UPDATE duranki_mfa_credential SET last_step=')){credentials.get(b).last_step=a;return [{affectedRows:1}];}
    if(sql.startsWith('INSERT INTO duranki_mfa_audit')){audit.push(args);return [{affectedRows:1}];}
    if(sql.startsWith('INSERT INTO duranki_auth_session')){sessions.set(a,{jti:a,user_id:b,expires_at:c,last_seen:d,revoked:0});return [{affectedRows:1}];}
    if(sql.startsWith('UPDATE duranki_auth_session SET last_seen=')){
      const row=sessions.get(b),allowed=row&&row.user_id===c&&!row.revoked&&row.expires_at>d&&row.last_seen>e;
      if(allowed)row.last_seen=Math.max(row.last_seen,a);
      return [{affectedRows:allowed?1:0}];
    }
    if(sql.startsWith('SELECT jti FROM duranki_auth_session')){
      const row=sessions.get(a);return [[row].filter(row=>row&&row.user_id===b&&!row.revoked&&row.expires_at>c&&row.last_seen>d)];
    }
    if(sql.startsWith('UPDATE duranki_auth_session SET revoked=1 WHERE jti=')){if(sessions.has(a))sessions.get(a).revoked=1;return [{affectedRows:1}];}
    if(sql.startsWith('UPDATE duranki_auth_session SET revoked=1 WHERE user_id=')){for(const row of sessions.values())if(row.user_id===a)row.revoked=1;return [{affectedRows:1}];}
    throw Error('Unexpected SQL in auth double: '+sql);
  },async getConnection(){
    let snapshot;
    return {execute:pool.execute,async beginTransaction(){snapshot=structuredClone({credentials,challenges,sessions,audit});},async commit(){snapshot=null;},async rollback(){
      for(const [target,source] of [[credentials,snapshot.credentials],[challenges,snapshot.challenges],[sessions,snapshot.sessions]]){target.clear();for(const [id,row] of source)target.set(id,row);}
      audit.splice(0,audit.length,...snapshot.audit);
    },release(){}};
  }};
  return pool;
}

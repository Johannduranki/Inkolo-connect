import { DatabaseSync } from 'node:sqlite';

export class SessionStore {
  constructor(filename, now = () => Date.now()) {
    this.now = now;
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS auth_session(jti TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0); CREATE INDEX IF NOT EXISTS auth_session_user ON auth_session(user_id);');
  }
  register(claims) {
    this.db.prepare('DELETE FROM auth_session WHERE expires_at < ?').run(this.now());
    this.db.prepare('INSERT INTO auth_session(jti,user_id,expires_at,last_seen) VALUES(?,?,?,?)').run(claims.jti, claims.sub, claims.exp * 1000, this.now());
  }
  allowed(claims, touch = true) {
    const row = this.db.prepare('SELECT * FROM auth_session WHERE jti=? AND user_id=?').get(claims.jti, claims.sub);
    const now = this.now();
    if (!row || row.revoked || row.expires_at <= now || now - row.last_seen > 30 * 60 * 1000) return false;
    if (touch) this.db.prepare('UPDATE auth_session SET last_seen=? WHERE jti=? AND revoked=0').run(now, claims.jti);
    return true;
  }
  revoke(jti) { this.db.prepare('UPDATE auth_session SET revoked=1 WHERE jti=?').run(jti); }
  revokeUser(userId) { this.db.prepare('UPDATE auth_session SET revoked=1 WHERE user_id=?').run(String(userId)); }
  close() { this.db.close(); }
}

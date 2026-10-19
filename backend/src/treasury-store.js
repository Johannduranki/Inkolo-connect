import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export class TreasuryStore {
  constructor(filename) {
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS scope(id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, tenant_name TEXT NOT NULL,
        community_id TEXT NOT NULL, community_name TEXT NOT NULL, UNIQUE(tenant_id,community_id));
      CREATE TABLE IF NOT EXISTS party(id TEXT PRIMARY KEY, name TEXT NOT NULL, service_id TEXT NOT NULL,
        beneficiary_reference TEXT NOT NULL, share_bps INTEGER NOT NULL CHECK(share_bps BETWEEN 1 AND 10000));
      CREATE TABLE IF NOT EXISTS receipt(id TEXT PRIMARY KEY, scope_id TEXT NOT NULL REFERENCES scope(id),
        party_id TEXT NOT NULL REFERENCES party(id), user_id TEXT NOT NULL, member_name TEXT NOT NULL,
        reference TEXT NOT NULL UNIQUE, received_cents INTEGER NOT NULL CHECK(received_cents>0),
        payable_cents INTEGER NOT NULL CHECK(payable_cents>0 AND payable_cents<=received_cents),
        share_bps INTEGER NOT NULL, received_on TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS payment(id TEXT PRIMARY KEY, party_id TEXT NOT NULL REFERENCES party(id),
        status TEXT NOT NULL CHECK(status IN ('DRAFT','APPROVED','SETTLED','CANCELLED')),
        created_by TEXT NOT NULL, approved_by TEXT, bank_reference TEXT UNIQUE, settled_by TEXT,
        created_at TEXT NOT NULL, settled_on TEXT);
      CREATE TABLE IF NOT EXISTS payment_line(receipt_id TEXT PRIMARY KEY REFERENCES receipt(id),
        payment_id TEXT NOT NULL REFERENCES payment(id));
      CREATE UNIQUE INDEX IF NOT EXISTS scope_community_unique ON scope(community_id);
      CREATE TABLE IF NOT EXISTS staff(user_id TEXT PRIMARY KEY, role TEXT NOT NULL CHECK(role IN ('Treasury Operator','Treasury Approver')),
        password_hash TEXT NOT NULL, version TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL,
        record_id TEXT NOT NULL, created_at TEXT NOT NULL);
    `);
  }
  all(sql, ...args) { return this.db.prepare(sql).all(...args); }
  get(sql, ...args) { return this.db.prepare(sql).get(...args); }
  run(sql, ...args) { return this.db.prepare(sql).run(...args); }
  transaction(work) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = work(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  audit(actor, action, id) { this.run('INSERT INTO audit(actor,action,record_id,created_at) VALUES(?,?,?,?)', String(actor), action, id, new Date().toISOString()); }
  staffById(id) { return this.get('SELECT * FROM staff WHERE user_id=?', String(id)); }
  activeStaff() { return this.all("SELECT user_id,role FROM staff WHERE version <> 'revoked'"); }
  tenantReceipts(id) { return this.all('SELECT r.*,s.tenant_id,s.community_id FROM receipt r JOIN scope s ON s.id=r.scope_id WHERE s.tenant_id=?', id); }
  assignStaff(id, role, hash, actor) {
    return this.transaction(() => {
      this.run('INSERT INTO staff VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,password_hash=excluded.password_hash,version=excluded.version', id, role, hash, randomUUID());
      this.audit(actor, 'STAFF_ACCESS_ASSIGNED', id);
    });
  }
  revokeStaff(id, actor) {
    return this.transaction(() => {
      this.run("UPDATE staff SET version='revoked' WHERE user_id=?", id);
      this.audit(actor, 'STAFF_ACCESS_REVOKED', id);
    });
  }
  addScope(id, values, actor) {
    return this.transaction(() => {
      this.run('INSERT INTO scope VALUES(?,?,?,?,?)', id, values.tenant_id, values.tenant_name, values.community_id, values.community_name);
      this.audit(actor, 'COMMUNITY_REGISTERED', id);
    });
  }
  addParty(id, values, actor) {
    return this.transaction(() => {
      this.run('INSERT INTO party VALUES(?,?,?,?,?)', id, values.name, values.service_id, values.beneficiary_reference, values.share_bps);
      this.audit(actor, 'STAKEHOLDER_REGISTERED', id);
    });
  }
  snapshot() {
    return {
      scopes: this.all('SELECT * FROM scope ORDER BY tenant_name,community_name'),
      parties: this.all('SELECT * FROM party ORDER BY name'),
      receipts: this.all(`SELECT r.*,s.tenant_name,s.community_name,p.name AS party_name,p.service_id,
        l.payment_id, COALESCE(pay.status,'UNALLOCATED') AS status FROM receipt r JOIN scope s ON s.id=r.scope_id
        JOIN party p ON p.id=r.party_id LEFT JOIN payment_line l ON l.receipt_id=r.id
        LEFT JOIN payment pay ON pay.id=l.payment_id ORDER BY r.created_at DESC`),
      payments: this.all(`SELECT p.*,party.name AS party_name,party.beneficiary_reference,
        COALESCE(SUM(r.payable_cents),0) AS amount_cents,COUNT(l.receipt_id) AS member_count
        FROM payment p JOIN party ON party.id=p.party_id LEFT JOIN payment_line l ON l.payment_id=p.id
        LEFT JOIN receipt r ON r.id=l.receipt_id GROUP BY p.id ORDER BY p.created_at DESC`),
      audit: this.all('SELECT * FROM audit ORDER BY id DESC LIMIT 100')
    };
  }
  receipt(values, actor) {
    return this.transaction(() => {
      if (!Number.isSafeInteger(values.received_cents) || values.received_cents < 1 || values.received_cents > 10000000000) throw new Error('Enter a valid receipt amount.');
      const party = this.get('SELECT * FROM party WHERE id=?', values.party_id);
      if (!party || !this.get('SELECT id FROM scope WHERE id=?', values.scope_id)) throw new Error('Select a registered community and stakeholder.');
      const id = randomUUID();
      const payable = Math.round(values.received_cents * party.share_bps / 10000);
      if (payable < 1) throw new Error('The stakeholder allocation rounds to zero.');
      this.run('INSERT INTO receipt VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', id, values.scope_id, values.party_id,
        values.user_id, values.member_name, values.reference, values.received_cents, payable, party.share_bps,
        values.received_on, String(actor), new Date().toISOString());
      this.audit(actor,'RECEIPT_CONFIRMED',id); return id;
    });
  }
  draft(ids, actor) {
    return this.transaction(() => {
      if (!Array.isArray(ids) || !ids.length || ids.length > 500) throw new Error('Select between 1 and 500 receipts.');
      const rows = ids.map(id => this.get('SELECT * FROM receipt WHERE id=?', id));
      if (rows.some(r => !r) || new Set(rows.map(r => r.party_id)).size !== 1) throw new Error('Select receipts for one stakeholder.');
      const id = randomUUID();
      this.run('INSERT INTO payment(id,party_id,status,created_by,created_at) VALUES(?,?,?,?,?)', id, rows[0].party_id,'DRAFT',String(actor),new Date().toISOString());
      for (const receiptId of ids) this.run('INSERT INTO payment_line VALUES(?,?)',receiptId,id);
      this.audit(actor,'PAYMENT_DRAFTED',id); return id;
    });
  }
  transition(id, action, actor, bankReference, settledOn) {
    return this.transaction(() => {
      const payment = this.get('SELECT * FROM payment WHERE id=?',id);
      if (!payment) throw new Error('Payment not found.');
      if (action === 'approve') {
        if (payment.status !== 'DRAFT') throw new Error('Only a draft can be approved.');
        if (payment.created_by === String(actor)) throw new Error('A different authorised user must approve this payment.');
        this.run("UPDATE payment SET status='APPROVED',approved_by=? WHERE id=?",String(actor),id);
      } else if (action === 'settle') {
        if (payment.status !== 'APPROVED') throw new Error('Only an approved payment can be reconciled.');
        if (!bankReference?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(settledOn || '')) throw new Error('A bank reference and settlement date are required.');
        this.run("UPDATE payment SET status='SETTLED',bank_reference=?,settled_by=?,settled_on=? WHERE id=?",bankReference,String(actor),settledOn,id);
      } else if (action === 'cancel') {
        if (payment.status !== 'DRAFT') throw new Error('Only a draft can be cancelled.');
        this.run("UPDATE payment SET status='CANCELLED' WHERE id=?",id);
        this.run('DELETE FROM payment_line WHERE payment_id=?',id);
      } else throw new Error('Invalid payment action.');
      this.audit(actor,`PAYMENT_${action.toUpperCase()}`,id);
    });
  }
}

import { randomUUID } from 'node:crypto';

export class MysqlTreasuryStore {
  constructor(pool) { this.pool = pool; }
  async ready() {
    const [rows] = await this.pool.execute('SELECT id FROM duranki_treasury_migration WHERE id=1');
    if (!rows.length) throw Error('Treasury storage metadata must be initialized before activation.');
  }
  async transaction(work) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback().catch(() => {});
      throw error;
    } finally { connection.release(); }
  }
  async audit(actor, action, id, connection = this.pool) {
    await connection.execute('INSERT INTO duranki_treasury_audit(actor,action,record_id,created_at) VALUES(?,?,?,?)', [String(actor), action, id, new Date().toISOString()]);
  }
  async staffById(id) {
    const [rows] = await this.pool.execute('SELECT * FROM duranki_treasury_staff WHERE user_id=?', [String(id)]);
    return rows[0];
  }
  async activeStaff() {
    const [rows] = await this.pool.query("SELECT user_id,role FROM duranki_treasury_staff WHERE version <> 'revoked'");
    return rows;
  }
  async tenantReceipts(id) {
    const [rows] = await this.pool.execute('SELECT r.*,s.tenant_id,s.community_id FROM duranki_treasury_receipt r JOIN duranki_treasury_scope s ON s.id=r.scope_id WHERE s.tenant_id=?', [id]);
    return rows;
  }
  assignStaff(id, role, hash, actor) {
    return this.transaction(async c => {
      await c.execute('INSERT INTO duranki_treasury_staff(user_id,role,password_hash,version) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE role=VALUES(role),password_hash=VALUES(password_hash),version=VALUES(version)', [id,role,hash,randomUUID()]);
      await this.audit(actor,'STAFF_ACCESS_ASSIGNED',id,c);
    });
  }
  revokeStaff(id, actor) {
    return this.transaction(async c => {
      await c.execute("UPDATE duranki_treasury_staff SET version='revoked' WHERE user_id=?", [id]);
      await this.audit(actor,'STAFF_ACCESS_REVOKED',id,c);
    });
  }
  addScope(id, values, actor) {
    return this.transaction(async c => {
      await c.execute('INSERT INTO duranki_treasury_scope(id,tenant_id,tenant_name,community_id,community_name) VALUES(?,?,?,?,?)', [id,values.tenant_id,values.tenant_name,values.community_id,values.community_name]);
      await this.audit(actor,'COMMUNITY_REGISTERED',id,c);
    });
  }
  addParty(id, values, actor) {
    return this.transaction(async c => {
      await c.execute('INSERT INTO duranki_treasury_party(id,name,service_id,beneficiary_reference,share_bps) VALUES(?,?,?,?,?)', [id,values.name,values.service_id,values.beneficiary_reference,values.share_bps]);
      await this.audit(actor,'STAKEHOLDER_REGISTERED',id,c);
    });
  }
  snapshot() {
    return this.transaction(async c => {
      const [scopes] = await c.query('SELECT * FROM duranki_treasury_scope ORDER BY tenant_name,community_name');
      const [parties] = await c.query('SELECT * FROM duranki_treasury_party ORDER BY name');
      const [receipts] = await c.query(`SELECT r.*,s.tenant_name,s.community_name,p.name AS party_name,p.service_id,
        l.payment_id,COALESCE(pay.status,'UNALLOCATED') AS status FROM duranki_treasury_receipt r JOIN duranki_treasury_scope s ON s.id=r.scope_id
        JOIN duranki_treasury_party p ON p.id=r.party_id LEFT JOIN duranki_treasury_payment_line l ON l.receipt_id=r.id
        LEFT JOIN duranki_treasury_payment pay ON pay.id=l.payment_id ORDER BY r.created_at DESC`);
      const [payments] = await c.query(`SELECT p.*,party.name AS party_name,party.beneficiary_reference,
        COALESCE(t.amount_cents,0) AS amount_cents,COALESCE(t.member_count,0) AS member_count
        FROM duranki_treasury_payment p JOIN duranki_treasury_party party ON party.id=p.party_id
        LEFT JOIN (SELECT l.payment_id,SUM(r.payable_cents) AS amount_cents,COUNT(*) AS member_count
          FROM duranki_treasury_payment_line l JOIN duranki_treasury_receipt r ON r.id=l.receipt_id GROUP BY l.payment_id) t ON t.payment_id=p.id
        ORDER BY p.created_at DESC`);
      const [audit] = await c.query('SELECT * FROM duranki_treasury_audit ORDER BY id DESC LIMIT 100');
      return {scopes,parties,receipts,payments:payments.map(p => ({...p,amount_cents:Number(p.amount_cents),member_count:Number(p.member_count)})),audit};
    });
  }
  receipt(values, actor) {
    return this.transaction(async c => {
      if (!Number.isSafeInteger(values.received_cents) || values.received_cents < 1 || values.received_cents > 10000000000) throw Error('Enter a valid receipt amount.');
      const [[party]] = await c.execute('SELECT * FROM duranki_treasury_party WHERE id=?', [values.party_id]);
      const [[scope]] = await c.execute('SELECT id FROM duranki_treasury_scope WHERE id=?', [values.scope_id]);
      if (!party || !scope) throw Error('Select a registered community and stakeholder.');
      const id = randomUUID(), payable = Math.round(values.received_cents * party.share_bps / 10000);
      if (payable < 1) throw Error('The stakeholder allocation rounds to zero.');
      await c.execute(`INSERT INTO duranki_treasury_receipt(id,scope_id,party_id,user_id,member_name,reference,received_cents,payable_cents,share_bps,received_on,created_by,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, [id,values.scope_id,values.party_id,values.user_id,values.member_name,values.reference,values.received_cents,payable,party.share_bps,values.received_on,String(actor),new Date().toISOString()]);
      await this.audit(actor,'RECEIPT_CONFIRMED',id,c);
      return id;
    });
  }
  draft(ids, actor) {
    return this.transaction(async c => {
      if (!Array.isArray(ids) || !ids.length || ids.length > 500 || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) throw Error('Select between 1 and 500 distinct receipts.');
      // Lock in stable order; the unique receipt key also prevents double allocation.
      const rows = [];
      for (const id of [...ids].sort()) {
        const [[row]] = await c.execute('SELECT * FROM duranki_treasury_receipt WHERE id=? FOR UPDATE', [id]);
        rows.push(row);
      }
      if (rows.some(r => !r) || new Set(rows.map(r => r.party_id)).size !== 1) throw Error('Select receipts for one stakeholder.');
      const id = randomUUID();
      await c.execute('INSERT INTO duranki_treasury_payment(id,party_id,status,created_by,created_at) VALUES(?,?,?,?,?)', [id,rows[0].party_id,'DRAFT',String(actor),new Date().toISOString()]);
      for (const receiptId of ids) await c.execute('INSERT INTO duranki_treasury_payment_line(receipt_id,payment_id) VALUES(?,?)', [receiptId,id]);
      await this.audit(actor,'PAYMENT_DRAFTED',id,c);
      return id;
    });
  }
  transition(id, action, actor, bankReference, settledOn) {
    return this.transaction(async c => {
      const [[payment]] = await c.execute('SELECT * FROM duranki_treasury_payment WHERE id=? FOR UPDATE', [id]);
      if (!payment) throw Error('Payment not found.');
      if (action === 'approve') {
        if (payment.status !== 'DRAFT') throw Error('Only a draft can be approved.');
        if (payment.created_by === String(actor)) throw Error('A different authorised user must approve this payment.');
        await c.execute("UPDATE duranki_treasury_payment SET status='APPROVED',approved_by=? WHERE id=?", [String(actor),id]);
      } else if (action === 'settle') {
        if (payment.status !== 'APPROVED') throw Error('Only an approved payment can be reconciled.');
        if (!bankReference?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(settledOn || '')) throw Error('A bank reference and settlement date are required.');
        await c.execute("UPDATE duranki_treasury_payment SET status='SETTLED',bank_reference=?,settled_by=?,settled_on=? WHERE id=?", [bankReference,String(actor),settledOn,id]);
      } else if (action === 'cancel') {
        if (payment.status !== 'DRAFT') throw Error('Only a draft can be cancelled.');
        await c.execute("UPDATE duranki_treasury_payment SET status='CANCELLED' WHERE id=?", [id]);
        await c.execute('DELETE FROM duranki_treasury_payment_line WHERE payment_id=?', [id]);
      } else throw Error('Invalid payment action.');
      await this.audit(actor,`PAYMENT_${action.toUpperCase()}`,id,c);
    });
  }
}

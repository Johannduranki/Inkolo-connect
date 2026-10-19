import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {MysqlTreasuryStore} from '../src/mysql-treasury-store.js';

test('MariaDB Treasury preserves atomic approvals, allocation and revocation', async t => {
  const pool = mysql.createPool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectionLimit:4});
  const store = new MysqlTreasuryStore(pool);
  const id = `sql-treasury-test-${randomUUID()}`, secondParty = `${id}-2`;
  // Delete only this run's synthetic records, in foreign-key order.
  t.after(async () => {
    try {
      await pool.execute('DELETE l FROM duranki_treasury_payment_line l JOIN duranki_treasury_payment p ON p.id=l.payment_id WHERE p.created_by=?',[id]);
      await pool.execute('DELETE FROM duranki_treasury_payment WHERE created_by=?',[id]);
      await pool.execute('DELETE FROM duranki_treasury_receipt WHERE created_by=?',[id]);
      await pool.execute('DELETE FROM duranki_treasury_party WHERE id IN (?,?)',[id,secondParty]);
      await pool.execute('DELETE FROM duranki_treasury_scope WHERE id=?',[id]);
      await pool.execute('DELETE FROM duranki_treasury_staff WHERE user_id=?',[id]);
      await pool.execute('DELETE FROM duranki_treasury_audit WHERE actor IN (?,?)',[id,`${id}-checker`]);
    } finally { await pool.end(); }
  });
  await store.addScope(id,{tenant_id:id,tenant_name:'Synthetic test only',community_id:id,community_name:'Synthetic test only'},id);
  await store.addParty(id,{name:'Synthetic test only',service_id:id,beneficiary_reference:'NOT-A-BANK',share_bps:8000},id);
  const values = {scope_id:id,party_id:id,user_id:id,member_name:'Synthetic test only',reference:id,received_cents:10000,received_on:'2026-01-01'};
  const receipt = await store.receipt(values,id);
  await assert.rejects(store.receipt(values,id),{code:'ER_DUP_ENTRY'});
  const drafts = await Promise.allSettled([store.draft([receipt],id),store.draft([receipt],id)]);
  assert.equal(drafts.filter(r=>r.status==='fulfilled').length,1);
  const payment = drafts.find(r=>r.status==='fulfilled').value;
  await assert.rejects(store.transition(payment,'approve',id),/different authorised user/);
  await assert.rejects(store.transition(payment,'settle',`${id}-checker`,id,'2026-01-02'),/approved/);
  const approvals = await Promise.allSettled([store.transition(payment,'approve',`${id}-checker`),store.transition(payment,'approve',`${id}-checker`)]);
  assert.equal(approvals.filter(r=>r.status==='fulfilled').length,1);
  await assert.rejects(store.transition(payment,'cancel',id),/draft/);
  await store.transition(payment,'settle',`${id}-checker`,id,'2026-01-02');
  const snapshot = await store.snapshot();
  const saved = snapshot.payments.find(p=>p.id===payment);
  assert.equal(saved.amount_cents,8000);
  assert.equal(saved.member_count,1);
  assert.equal(saved.status,'SETTLED');
  assert.equal(snapshot.receipts.find(r=>r.id===receipt).status,'SETTLED');
  assert.equal((await store.tenantReceipts(id)).length,1);
  await store.assignStaff(id,'Treasury Operator','synthetic-not-a-password',id);
  const version = (await store.staffById(id)).version;
  await store.assignStaff(id,'Treasury Approver','synthetic-not-a-password',id);
  assert.notEqual((await store.staffById(id)).version,version);
  assert.ok(!(await store.activeStaff()).some(r=>'password_hash' in r));
  await store.revokeStaff(id,id);
  assert.equal((await store.staffById(id)).version,'revoked');
  assert.ok(!(await store.activeStaff()).some(r=>r.user_id===id));
  // An audit failure must roll back the business write in the same transaction.
  const failing = new MysqlTreasuryStore(pool);
  failing.audit = async () => { throw Error('synthetic audit failure'); };
  await assert.rejects(failing.addParty(secondParty,{name:'Synthetic',service_id:id,beneficiary_reference:'NONE',share_bps:100},id),/synthetic audit failure/);
  const [[count]] = await pool.execute('SELECT COUNT(*) AS n FROM duranki_treasury_party WHERE id=?',[secondParty]);
  assert.equal(count.n,0);
});

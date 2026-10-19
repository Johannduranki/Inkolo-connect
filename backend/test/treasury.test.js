import test from 'node:test';
import assert from 'node:assert/strict';
import { TreasuryStore } from '../src/treasury-store.js';

function setup(t) {
  const s = new TreasuryStore(':memory:');
  t.after(()=>s.db.close());
  s.run('INSERT INTO scope VALUES(?,?,?,?,?)','scope','tenant','Tenant','community','Community');
  s.run('INSERT INTO party VALUES(?,?,?,?,?)','party','Funeral provider','funeral','BEN-1',8000);
  return s;
}
function receipt(s, reference='REF-1') {
  return s.receipt({ scope_id:'scope',party_id:'party',user_id:'member',member_name:'Test Member',reference,received_cents:10000,received_on:'2026-09-01' },'maker');
}
test('receipt allocation and duplicate source reference enforcement', t=>{
  const s=setup(t);receipt(s);
  assert.equal(s.snapshot().receipts[0].payable_cents,8000);
  assert.throws(()=>receipt(s));
  assert.equal(s.snapshot().receipts.length,1);
});
test('duplicate payment allocation rolls back and preserves first payment',t=>{
  const s=setup(t),id=receipt(s);s.draft([id],'maker');
  assert.throws(()=>s.draft([id],'maker'));
  assert.equal(s.snapshot().payments.length,1);
});
test('maker cannot approve; settlement needs approval and unique bank reference',t=>{
  const s=setup(t),id=s.draft([receipt(s)],'maker');
  assert.throws(()=>s.transition(id,'approve','maker'));
  assert.throws(()=>s.transition(id,'settle','checker','BANK-1','2026-09-02'));
  s.transition(id,'approve','checker');
  assert.throws(()=>s.transition(id,'settle','checker','','2026-09-02'));
  s.transition(id,'settle','checker','BANK-1','2026-09-02');
  assert.equal(s.snapshot().payments[0].status,'SETTLED');
  const second=s.draft([receipt(s,'REF-2')],'maker');s.transition(second,'approve','checker');
  assert.throws(()=>s.transition(second,'settle','checker','BANK-1','2026-09-02'));
});
test('cancelled drafts release receipts and approved payments cannot be cancelled',t=>{
  const s=setup(t),r=receipt(s),p=s.draft([r],'maker');s.transition(p,'cancel','maker');
  assert.equal(s.snapshot().receipts[0].status,'UNALLOCATED');
  const p2=s.draft([r],'maker');s.transition(p2,'approve','checker');
  assert.throws(()=>s.transition(p2,'cancel','maker'));
});
test('empty drafts and invalid amounts are rejected',t=>{
  const s=setup(t);assert.throws(()=>s.draft([],'maker'));
  assert.throws(()=>s.receipt({received_cents:0},'maker'));
  assert.throws(()=>s.receipt({received_cents:1.5},'maker'));
});

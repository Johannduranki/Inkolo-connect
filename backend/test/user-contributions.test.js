import test from 'node:test';
import assert from 'node:assert/strict';
import {userContributions} from '../src/user-contributions.js';
test('totals active monthly charges separately by currency, excluding one-off and cancelled charges',()=>{
  const rows=[{amountCents:700,planCode:'monthly'},{amountCents:1000,billingCycle:'monthly'},{amountCents:3000,billingCycle:'once'},{amountCents:200,billingCycle:'monthly',currency:'USD'},{amountCents:900,billingCycle:'monthly',status:'cancelled'}].map(s=>({userId:1,status:'active',...s}));
  const result=userContributions(rows,1);assert.deepEqual(result.monthlyContribution.totals,{ZAR:1700,USD:200});assert.equal(result.monthlyContribution.incomplete,false);assert.equal(userContributions(rows,2).subscriptions.length,0);
});
test('missing data is not reported as zero and free subscriptions are zero',()=>{assert.equal(userContributions([],1).monthlyContribution.hasRecords,false);const result=userContributions([{userId:1,status:'active'},{userId:1,status:'active',amountCents:0}],1);assert.equal(result.subscriptions[0].monthlyAmountCents,null);assert.equal(result.subscriptions[1].monthlyAmountCents,0);});

import test from 'node:test';
import assert from 'node:assert/strict';
import {moneyCents, transferBalances} from '../src/wallet-security.js';
const wallet = (balance = 10) => ({balance,availableBalance:balance,status:'ACTIVE',currency:'ZAR'});

test('money rejects coercion, fractional cents, negative and unsafe amounts', () => {
  for (const value of ['10',null,NaN,Infinity,-1,0.001,Number.MAX_SAFE_INTEGER]) assert.equal(moneyCents(value),null);
  assert.equal(moneyCents(0.29),29);
});
test('wallet transfer calculates in cents without mutating input or losing money', () => {
  const sender = wallet(0.3), recipient = wallet(0.2);
  assert.deepEqual(transferBalances(sender,recipient,0.1),[0.2,0.2,0.3,0.3]);
  assert.equal(sender.balance,0.3);
});
test('wallet transfer rejects inactive, foreign currency and inconsistent balances', () => {
  for (const bad of [{...wallet(),status:'FROZEN'}, {...wallet(),currency:'USD'}, {...wallet(),availableBalance:11}, {...wallet(),balance:NaN}]) {
    assert.throws(() => transferBalances(bad,wallet(),1), {status:409});
    assert.throws(() => transferBalances(wallet(),bad,1), {status:409});
  }
  assert.throws(() => transferBalances(wallet(),wallet(),11), {status:409});
  assert.throws(() => transferBalances(wallet(),wallet(),0.001), {status:400});
});

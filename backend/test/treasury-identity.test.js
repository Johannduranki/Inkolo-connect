import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTreasuryIdentity } from '../src/treasury-identity.js';

test('Treasury resolves current platform administrators without fixed demo IDs', async () => {
  const user = {id: '91001', status: 'active', roles: ['Platform Admin']};
  assert.equal(await resolveTreasuryIdentity(user.id, {}, async () => user, {staffById: () => null}), user);
});
test('Treasury rejects stale admin claims and inactive or missing identities', async () => {
  for (const user of [null, {status:'inactive',roles:['Platform Admin']}, {status:'active',roles:['Member']}]) {
    assert.equal(await resolveTreasuryIdentity('1000001', {treasury:'admin'}, async()=>user, {staffById:()=>null}), null);
  }
});
test('Treasury staff require the current version and a recognized scoped role', async () => {
  const user = {status:'active',roles:['Member']};
  const find = async()=>user;
  for (const staff of [{version:'revoked',role:'Treasury Operator'},{version:'new',role:'Treasury Operator'},{version:'old',role:'Platform Admin'}]) {
    assert.equal(await resolveTreasuryIdentity('staff',{treasury:'old'},find,{staffById:()=>staff}),null);
  }
  const result = await resolveTreasuryIdentity('staff',{treasury:'current'},find,{staffById:()=>({version:'current',role:'Treasury Operator'})});
  assert.deepEqual(result.roles,['Treasury Operator']);
});

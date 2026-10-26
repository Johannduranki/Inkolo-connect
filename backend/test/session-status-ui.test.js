import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const script = readFileSync(new URL('../../frontend/public/mfa-navigation.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness(fetch) {
  const values = new Map([['duranki_access_token','synthetic-session']]);
  const storage = { getItem: key => values.get(key) || null, setItem: (key,value) => values.set(key,value), removeItem: key => values.delete(key) };
  let interval, redirect, time=1000;
  vm.runInNewContext(script, { sessionStorage: storage, localStorage: storage, Date: { now: () => time },
    document: { addEventListener() {} },
    location: { pathname: '/dashboard/tenant', replace: url => { redirect=url; } }, fetch,
    setInterval: fn => { interval=fn; } });
  return { values, redirect: () => redirect, advance: async () => { time+=60001;await interval(); } };
}
test('expired session clears credentials and returns a protected screen to login', async () => {
  const h = harness(async()=>({status:401,ok:false}));await tick();
  assert.equal(h.values.size,0);assert.equal(h.redirect(),'/login');
});
test('a delayed 401 never clears a newer login or an MFA handoff', async () => {
  for(const challenge of [false,true]){
    let finish;const h=harness(()=>new Promise(resolve=>{finish=resolve;}));
    if(challenge)h.values.set('duranki_mfa_challenge','new-challenge');else h.values.set('duranki_access_token','new-session');
    finish({status:401,ok:false});await tick();assert.equal(h.redirect(),undefined);
    assert.equal(h.values.get(challenge?'duranki_mfa_challenge':'duranki_access_token'),challenge?'new-challenge':'new-session');
  }
});
test('temporary failures do not log users out and unchanged sessions are rechecked', async () => {
  let calls=0;const h=harness(async()=>{calls++;return {ok:false,status:503};});await tick();
  assert.equal(h.redirect(),undefined);assert.equal(h.values.size,1);
  await h.advance();assert.equal(calls,2);assert.equal(h.redirect(),undefined);
});

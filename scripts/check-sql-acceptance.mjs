import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = realpathSync(process.argv[2]), phase = process.argv[3];
assert.ok(['before','after'].includes(phase));
const read = f => JSON.parse(readFileSync(path.join(root, f)));
assert.equal(read('manifest.json').root, root);
assert.equal(read('sql-isolated/prepared.json').syntheticOnly, true);
assert.equal(read('running.json').port, 4309);
const sql = read('sql-isolated/app.private.json');
assert.equal(sql.port, 13308);
const require = createRequire(path.join(root, 'backend/package.json'));
const mysql = require('mysql2/promise');
const { readSqlDocument } = await import(pathToFileURL(path.join(root, 'backend/src/mysql-platform-store.js')));
const db = await mysql.createConnection({ host:'127.0.0.1', port:sql.port, user:sql.user, password:sql.password, database:sql.database });
const [[identity]] = await db.query('SELECT @@datadir AS data');
assert.equal(realpathSync(identity.data).toLowerCase(), realpathSync(sql.data).toLowerCase());
const file = 'sql-isolated/acceptance-session.private.json';
const tokens = phase === 'after' ? read(file).tokens : {};
const checks = [];
async function request(actor, route, method='GET', body, expected=200) {
  const res = await fetch('http://127.0.0.1:4309' + route, { method, signal:AbortSignal.timeout(10000), redirect:'error', headers:{'Content-Type':'application/json', ...(tokens[actor] ? {Authorization:'Bearer '+tokens[actor]} : {})}, body:body===undefined?undefined:JSON.stringify(body) });
  assert.equal(res.status, expected, method+' '+route+': '+res.status);
  return res.status===204?null:res.json();
}
try {
  const health = await request(null, '/api/health');
  for(const name of ['authentication','platform','wallet','treasury','training','cycle','heritage']) assert.equal(health[name+'Storage'], 'mariadb');
  if(phase==='before') {
    const accounts=read('accounts.private.json'), mfa=read('mfa.private.json');
    const {authenticator}=require('@otplib/v12-adapter');
    for(const actor of ['platform','tenant-a','member-a']) {
      const a=accounts.find(a=>a.name===actor);
      let login=await request(null,'/api/auth/login','POST',{telephoneNumber:a.telephoneNumber,password:a.password});
      tokens[actor]=login.accessToken;
      if(login.mfaRequired) {login=await request(actor,'/api/auth/mfa/verify','POST',{code:authenticator.generate(mfa[actor].secret)});tokens[actor]=login.accessToken;}
    }
    assert.deepEqual((await request('tenant-a','/api/tenant-access')).map(t=>t.id),['tenant-stage-a']);
    await request('tenant-a','/api/tenant-access/tenant-stage-b/staff','GET',undefined,403);
    const own=await request('member-a','/api/platform/community/me?communityId=community-stage-a');
    assert.equal(own.tenantId,'tenant-stage-a');
    await request('member-a','/api/platform/community/me?communityId=community-stage-b','GET',undefined,403);
    checks.push('SQL sessions/MFA authenticate; tenant and community boundaries enforced');
    const initial=(await readSqlDocument(db)).state;
    const price=(await request('platform','/api/service-pricing')).services.find(s=>s.code==='jobs');
    await request('platform','/api/service-pricing/jobs','PUT',{mode:'free',amountCents:0,costCents:0,shares:{community:3000,tenant:3000,duranki:4000},revision:price.revision});
    // Only synthetic catalogue visibility, not provider credentials, payment rails or dispatch settings.
    await request('platform','/api/cycle/availability','PUT',{tenants:[{id:'tenant-stage-a',status:'active',serviceCodes:['jobs','loans','wallet']},{id:'tenant-stage-b',status:'active',serviceCodes:['marketplace']}],communities:[{id:'community-stage-a',tenantId:'tenant-stage-a',status:'active',serviceCodes:['jobs','loans','wallet']},{id:'community-stage-b',tenantId:'tenant-stage-b',status:'active',serviceCodes:['marketplace']}]});
    const sub=await request('member-a','/api/subscriptions','POST',{serviceCode:'jobs',planCode:'configured-free',acceptance:{accepted:true}},201);
    assert.equal(sub.status,'active'); assert.equal(sub.amountCents,0);
    const saved=await readSqlDocument(db);
    assert.ok(saved.state.serviceSubscriptions.some(s=>s.serviceCode==='jobs'));
    for(const key of ['users','wallets','walletTransactions','tenantStaff','providerAccessGrants']) assert.deepEqual(saved.state[key], initial[key]);
    writeFileSync(path.join(root,file),JSON.stringify({tokens,revision:saved.revision,sha256:saved.sha256}),{flag:'wx'});
    checks.push('HTTP free subscription and synthetic catalogue committed to SQL; wallets/identity/permissions unchanged');
  } else {
    const previous=read(file), current=await readSqlDocument(db);
    assert.equal(current.sha256,previous.sha256); assert.equal(current.revision,previous.revision);
    assert.equal((await request('member-a','/api/auth/me')).id,91004);
    const membership=await request('member-a','/api/platform/community/me?communityId=community-stage-a');
    assert.deepEqual(membership.serviceConfiguration.serviceCodes,['jobs','loans','wallet']);
    const prices=await request('member-a','/api/service-pricing');
    assert.equal(prices.services.find(s=>s.code==='jobs').mode,'free');
    assert.ok(prices.services.every(s=>!Object.hasOwn(s,'costCents')&&!Object.hasOwn(s,'shares')));
    for(const actor of Object.keys(tokens)) await request(actor,'/api/auth/logout','POST',{},204);
    await request('member-a','/api/auth/me','GET',undefined,401);
    checks.push('Restart preserves SQL document checksum/revision, session, membership catalogue and pricing privacy; logout revokes session');
  }
  const result={at:new Date().toISOString(),phase,passed:true,checks,scope:'Synthetic SQL-backed app only; no live database or provider settings accessed'};
  writeFileSync(path.join(root,'sql-isolated/acceptance-'+phase+'.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
} finally {await db.end();}

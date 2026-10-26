import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyDatabase} from '../src/database.js';
import {getConfig} from '../src/config.js';

test('only a MariaDB server is accepted', async () => {
  await verifyDatabase({query:async()=>[[{version:'11.4.8-MariaDB'}]]});
  await assert.rejects(verifyDatabase({query:async()=>[[{version:'8.0.42'}]]}), {code:'UNSUPPORTED_DATABASE'});
  await assert.rejects(verifyDatabase({query:async()=>{throw Object.assign(Error('offline'),{code:'ECONNREFUSED'});}}), {code:'ECONNREFUSED'});
});

test('local authentication and unsupported storage configuration fail closed', () => {
  const saved={...process.env};
  try {
    process.env.NODE_ENV='test';
    process.env.ALLOW_DEMO_AUTH='true';
    assert.throws(()=>getConfig(), /no longer supported/);
    process.env.ALLOW_DEMO_AUTH='false';
    process.env.AUTH_STORAGE='unsupported';
    assert.throws(()=>getConfig(), /AUTH_STORAGE must be mariadb/);
  } finally {
    for(const name of Object.keys(process.env))if(!(name in saved))delete process.env[name];
    Object.assign(process.env,saved);
  }
});

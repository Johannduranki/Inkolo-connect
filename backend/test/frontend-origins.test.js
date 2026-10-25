import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import express from 'express';
import {frontendOrigins, createFrontendCors} from '../src/frontend-origins.js';
import {validateProduction} from '../src/production-security.js';

test('deployed development origins work with existing localhost configuration', () => {
  const origins = frontendOrigins({FRONTEND_ORIGIN:'http://localhost:4200'});
  for (const origin of ['http://localhost:4200','http://app-dev.duranki.network','https://app-dev.duranki.network']) assert.ok(origins.includes(origin));
  assert.ok(!origins.includes('*'));
});

test('configured origins remain exact, trimmed and unique', () => {
  const origins = frontendOrigins({FRONTEND_ORIGINS:' https://custom.example , https://custom.example '});
  assert.equal(origins.filter(origin => origin === 'https://custom.example').length, 1);
  assert.ok(!origins.includes('http://localhost:4200'));
});

test('production does not gain an HTTP deployment exception or weaken validation', () => {
  const origins = frontendOrigins({NODE_ENV:'production',FRONTEND_ORIGIN:'https://custom.example'});
  assert.ok(origins.includes('https://app-dev.duranki.network'));
  assert.ok(!origins.includes('http://app-dev.duranki.network'));
  assert.ok(!origins.includes('capacitor://localhost'));
  assert.throws(() => validateProduction({NODE_ENV:'production',FRONTEND_ORIGIN:'http://app-dev.duranki.network'}), /HTTPS frontend origins/);
});

test('real CORS middleware admits the deployed browser, preserves auth errors and rejects lookalikes', async t => {
  const app = express();
  app.use(createFrontendCors(frontendOrigins({FRONTEND_ORIGIN:'http://localhost:4200'})));
  app.use(express.json());
  let loginCalls = 0;
  app.get('/api/health', (_req,res) => res.json({status:'ok'}));
  // No credentials or database involved: prove middleware reaches authentication,
  // not that a CORS allowance authenticates anyone.
  app.post('/api/auth/login', (_req,res) => { loginCalls++; res.status(401).json({message:'Telephone number or password is incorrect.'}); });
  app.use((error,_req,res,_next) => res.status(error.status || 500).json({message:'Access denied.'}));
  const server = app.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = 'http://127.0.0.1:' + server.address().port;
  for (const origin of ['http://app-dev.duranki.network','https://app-dev.duranki.network']) {
    const health = await fetch(base+'/api/health',{headers:{Origin:origin}});
    assert.equal(health.status,200);
    assert.equal(health.headers.get('access-control-allow-origin'),origin);
    const preflight = await fetch(base+'/api/auth/login',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,authorization'}});
    assert.equal(preflight.status,204);
    const login = await fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});
    assert.equal(login.status,401);
  }
  assert.equal(loginCalls,2);
  for (const origin of ['null','https://unrelated.example','http://app-dev.duranki.network.evil.example','http://app-dev.duranki.network:8080','http://app-dev.duranki.network/']) {
    const response = await fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});
    assert.equal(response.status,403,origin);
    assert.equal(response.headers.get('access-control-allow-origin'),null);
  }
  assert.equal(loginCalls,2,'Rejected origins must not reach authentication');
  assert.equal((await fetch(base+'/api/health')).status,200);
});

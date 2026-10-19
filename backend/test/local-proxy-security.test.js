import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { apiProxyTarget, originRelativeUrl, proxyHeaders, proxyApiRequest } from '../../scripts/local-proxy-security.mjs';
import { createLocalServer } from '../../scripts/local-demo-server.mjs';

async function listen(t, server) {
  server.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}
function rawRequest(url, path) {
  return new Promise((resolve, reject) => {
    const req = request(url, { path }, res => { let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,body})); });
    req.on('error',reject);req.end();
  });
}

test('proxy rejects authority-changing request targets and malformed paths', () => {
  for (const value of ['https://other.invalid/api/health','//other.invalid/api/health','/\\other.invalid/api','/api\n/private','/api#fragment','/bad%GG']) assert.throws(()=>originRelativeUrl(value));
  for (const value of ['file:///tmp/file','http://user:password@localhost','http://localhost/base']) assert.throws(()=>apiProxyTarget('/api/health',value));
});
test('proxy pins the configured origin while preserving ordinary paths and queries', () => {
  const target=apiProxyTarget('/api/test?return=https://other.invalid/path','http://127.0.0.1:3000');
  assert.equal(target.origin,'http://127.0.0.1:3000');assert.equal(target.pathname,'/api/test');assert.equal(target.searchParams.get('return'),'https://other.invalid/path');
  assert.equal(apiProxyTarget('/api/%2f%2fother.invalid','http://127.0.0.1:3000').hostname,'127.0.0.1');
});
test('proxy removes forwarding and hop-by-hop headers but preserves authentication', () => {
  const headers=proxyHeaders({host:'forged',authorization:'Bearer synthetic',connection:'x-internal, upgrade','x-internal':'private','x-forwarded-for':'forged','x-forwarded-host':'forged',forwarded:'forged','proxy-authorization':'private',upgrade:'websocket','content-type':'application/json'},new URL('http://127.0.0.1:3000'));
  assert.deepEqual(headers,{authorization:'Bearer synthetic','content-type':'application/json',host:'127.0.0.1:3000'});
});
test('local server rejects hostile request targets before forwarding', async t => {
  let received=0;const upstream=await listen(t,createServer((_req,res)=>{received++;res.end('ok');}));
  const url=await listen(t,createLocalServer({target:upstream}));
  for(const path of ['//other.invalid/api/health','http://other.invalid/api/health','/api/%GG'])assert.equal((await rawRequest(url,path)).status,400);
  assert.equal(received,0);
});
test('local API proxy preserves body, authorization, status and private response headers', async t => {
  const upstream=await listen(t,createServer((req,res)=>{
    let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{assert.equal(req.headers.authorization,'Bearer synthetic');assert.equal(req.headers['x-forwarded-for'],undefined);assert.equal(body,'{"fixture":true}');res.writeHead(201,{'Cache-Control':'no-store','Content-Type':'application/json'});res.end('{"created":true}');});
  }));
  const url=await listen(t,createLocalServer({target:upstream}));
  const response=await fetch(url+'/api/fixture',{method:'POST',headers:{authorization:'Bearer synthetic','x-forwarded-for':'spoof','content-type':'application/json'},body:'{"fixture":true}'});
  assert.equal(response.status,201);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{created:true});
});
test('proxy errors are generic and do not expose host, port or system error', async t => {
  const unavailable=createServer();unavailable.listen(0,'127.0.0.1');await new Promise(resolve=>unavailable.once('listening',resolve));const port=unavailable.address().port;await new Promise(resolve=>unavailable.close(resolve));
  const url=await listen(t,createLocalServer({target:`http://127.0.0.1:${port}`}));
  const response=await fetch(url+'/api/health');assert.equal(response.status,502);assert.equal(response.headers.get('cache-control'),'no-store');assert.doesNotMatch(await response.text(),/127\.0\.0\.1|ECONN|stack|connect|\d{4}/);
});
test('proxy times out stalled upstream requests without internal error details', async t => {
  const upstream=await listen(t,createServer(()=>{}));
  const url=await listen(t,createServer((req,res)=>proxyApiRequest(req,res,upstream,30)));
  const response=await fetch(url+'/api/fixture');assert.equal(response.status,504);assert.match(await response.text(),/temporarily unavailable/);
});
test('static login response has non-breaking baseline browser protections', async t => {
  const directory=mkdtempSync(path.join(tmpdir(),'duranki-proxy-test-'));
  const file=path.join(directory,'index.html');writeFileSync(file,'<!doctype html><html><head><title>Test login</title></head><body>Fixture</body></html>');
  t.after(()=>{unlinkSync(file);rmdirSync(directory);});
  const url=await listen(t,createLocalServer({directory}));
  const response=await fetch(url+'/login');assert.equal(response.status,200);assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(response.headers.get('x-frame-options'),'DENY');assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(response.headers.get('permissions-policy'),/geolocation=\(self\)/);await response.arrayBuffer();
});

test('standalone admin stylesheet is forwarded instead of falling through to the login HTML', async t => {
  const upstream = await listen(t, createServer((req, res) => {
    assert.equal(req.url, '/admin-responsive.css');
    res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
    res.end('header { max-width: 100%; }');
  }));
  const origin = await listen(t, createLocalServer({ target: upstream }));
  const response = await fetch(origin + '/admin-responsive.css');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/css/);
  assert.equal(await response.text(), 'header { max-width: 100%; }');
});

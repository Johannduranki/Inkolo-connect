import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createHash } from 'node:crypto';
import { createPlatformRouter } from '../src/platform-api.js';
import { getTermsDocument } from '../src/legal-agreements.js';

async function harness(t) {
  const state={users:[
    {id:'owner',status:'active',roles:['Member']},
    {id:'other',status:'active',roles:['Member']},
    {id:'legacy',status:'active',roles:['Admin User']},
    {id:'kzncc',status:'active',roles:['KZNCC Admin']},
    {id:'provider',status:'active',roles:['Service Provider Admin']},
    {id:'admin',status:'active',roles:['Platform Admin']},
    {id:'duranki',status:'active',roles:['DURANKI_ADMIN']}
  ],legalAcceptances:[{id:'agreement-a',userId:'owner',serviceCode:'test',documentVersion:'1.0',documentMimeType:'text/html; charset=utf-8',documentSnapshot:'<h1>Original terms</h1>',memberTelephone:'private-test-number'}]};
  const app=express();app.use('/platform',createPlatformRouter({
    requireAuth:(req,res,next)=>{if(!req.get('x-user'))return res.sendStatus(401);req.auth={sub:req.get('x-user')};next();},
    readPlatformState:()=>state,updatePlatformState:()=>{throw Error('Read-only test must not mutate state.');}
  }));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>{server.closeAllConnections();server.close();});
  return {state,get:(actor,kind,id='agreement-a')=>fetch(`http://127.0.0.1:${server.address().port}/platform/agreements/${id}/${kind}`,{headers:actor?{'x-user':actor}:{}})};
}

for(const kind of ['document','evidence']) {
  test(`agreement ${kind} requires active ownership or platform administration`,async t=>{
    const h=await harness(t),before=structuredClone(h.state);
    assert.equal((await h.get(null,kind)).status,401);
    for(const actor of ['other','legacy','kzncc','provider','missing']) {
      const response=await h.get(actor,kind);assert.equal(response.status,404,actor);
      assert.doesNotMatch(await response.text(),/private-test-number|Original terms/);
    }
    for(const actor of ['owner','admin','duranki'])assert.equal((await h.get(actor,kind)).status,200,actor);
    assert.equal((await h.get('admin',kind,'missing')).status,404);
    assert.deepEqual(h.state,before);
    for(const actor of ['owner','admin','duranki']) {
      h.state.users.find(user=>user.id===actor).status='inactive';
      assert.equal((await h.get(actor,kind)).status,404,actor);
    }
  });
}

test('archived HTML is preserved but sandboxed, non-cacheable and uses a safe filename',async t=>{
  const h=await harness(t),record=h.state.legalAcceptances[0];
  record.serviceCode='evil"\r\nX-Injected: yes';record.documentVersion='../bad';record.documentMimeType='application/javascript';
  record.documentSnapshot='<script>window.parent.location="https://example.invalid"</script><h1>Archived</h1>';
  const response=await h.get('owner','document');assert.equal(response.status,200);
  assert.match(response.headers.get('content-type'),/^text\/html/);
  assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.equal(response.headers.get('referrer-policy'),'no-referrer');
  const csp=response.headers.get('content-security-policy');
  assert.match(csp,/^sandbox;/);assert.match(csp,/default-src 'none'/);assert.match(csp,/form-action 'none'/);
  assert.doesNotMatch(csp,/allow-scripts|allow-same-origin/);
  assert.equal(response.headers.get('x-injected'),null);
  assert.match(response.headers.get('content-disposition'),/^inline; filename="[a-zA-Z0-9._-]+\.html"$/);
  assert.equal(await response.text(),record.documentSnapshot);
});

test('acceptance evidence exports are private attachments without modifying the record',async t=>{
  const h=await harness(t),before=structuredClone(h.state.legalAcceptances[0]);
  const response=await h.get('owner','evidence');
  assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.match(response.headers.get('content-disposition'),/^attachment;/);
  assert.deepEqual((await response.json()).agreement,before);
  assert.deepEqual(h.state.legalAcceptances[0],before);
});

test('new generic terms escape configured service and plan text while preserving document checksums',()=>{
  const document=getTermsDocument('<script>bad()</script>','<img src=x onerror=bad()> & "plan"');
  assert.doesNotMatch(document.content,/<script>|<img /);
  assert.match(document.content,/&lt;script&gt;/);assert.match(document.content,/&lt;img/);assert.match(document.content,/&amp; &quot;plan&quot;/);
  assert.equal(document.sha256,createHash('sha256').update(document.content,'utf8').digest('hex'));
});

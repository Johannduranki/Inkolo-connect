import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {saveLanguage,readLanguage,createLanguageRouter} from '../src/language-preferences.js';
test('preferences default to English, reject unsupported values and preserve unrelated records',()=>{
 const s={users:[{id:'a',name:'Unchanged'}],applications:[{id:1}]};const before=structuredClone(s);
 assert.deepEqual(readLanguage(s,'a'),{language:'en'});saveLanguage(s,'a','zu');saveLanguage(s,'b','en');assert.equal(readLanguage(s,'a').language,'zu');assert.equal(readLanguage(s,'b').language,'en');assert.throws(()=>saveLanguage(s,'a','fr'),{status:400});assert.equal(readLanguage(s,'a').language,'zu');assert.deepEqual(s.users,before.users);assert.deepEqual(s.applications,before.applications);
});
test('authenticated preference API only reads and changes its own account',async t=>{
 const s={},app=express();app.use(express.json());app.use('/language',createLanguageRouter({requireAuth:(req,res,next)=>{if(!req.headers.authorization)return res.sendStatus(401);req.auth={sub:req.headers.authorization};next();},resolveUser:async id=>({status:id==='disabled'?'disabled':'active'}),readState:()=>s,updateState:async fn=>fn(s)}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const url='http://127.0.0.1:'+server.address().port+'/language';
 const request=(who,method='GET',body)=>fetch(url,{method,headers:{Authorization:who,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 assert.equal((await fetch(url)).status,401);assert.equal((await request('disabled')).status,403);
 assert.equal((await request('a','PUT',{language:'zu',userId:'b'})).status,200);assert.equal((await(await request('a')).json()).language,'zu');assert.equal((await(await request('b')).json()).language,'en');assert.equal((await request('a','PUT',{language:'../../x'})).status,400);
});
test('shared language runtime handles anonymous choice, login save, reload, logout and English fallback without browser storage',async()=>{
 const oldDocument=globalThis.document,oldFetch=globalThis.fetch;globalThis.document={documentElement:{lang:'en'}};const records={};let writes=0;
 globalThis.fetch=async(url,options)=>{const id=options.headers.Authorization;if(options.method==='PUT'){records[id]=JSON.parse(options.body).language;writes++;}return {ok:true,json:async()=>({language:records[id]||'en'})};};
 try{const lang=await import('../../frontend/public/language.js');await lang.chooseLanguage('zu');assert.equal(lang.translate('Telephone number'),'Inombolo yocingo');assert.equal(lang.translate('Untranslated text'),'Untranslated text');assert.equal(writes,0);await lang.languageSession('member');assert.equal(writes,1);assert.equal(records['Bearer member'],'zu');lang.resetLanguage();assert.equal(lang.currentLanguage(),'en');await lang.languageSession('member');assert.equal(lang.currentLanguage(),'zu');await lang.chooseLanguage('en');assert.equal(records['Bearer member'],'en');await assert.rejects(()=>lang.chooseLanguage('fr'));globalThis.fetch=async()=>({ok:false});await assert.rejects(()=>lang.chooseLanguage('zu'));lang.resetLanguage();}finally{globalThis.document=oldDocument;globalThis.fetch=oldFetch;}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const script=fs.readFileSync(new URL('../../frontend/public/treasury-navigation.js',import.meta.url),'utf8');
async function render(pathname,access){
  const nodes=[];
  const element=tag=>{
    const node={tag,dataset:{},style:{},children:[],setAttribute(){},append(child){this.children.push(child);},remove(){},querySelector(selector){return selector==='a'?this.children.flatMap(c=>[c,...c.children]).find(c=>c.tag==='a'):null;}};
    nodes.push(node);return node;
  };
  const host=element('services'),header=element('nav');
  const document={head:element('head'),body:element('body'),createElement:element,addEventListener(){},querySelector(selector){
    if(selector==='[data-heritage-services]')return host.children.find(n=>n.dataset.heritageServices);
    if(selector==='input[placeholder="New service name"]')return {closest:()=>host};
    if(selector==='.services-section .service-grid')return pathname==='/dashboard/member'?host:null;
    if(selector==='.community-active-content')return pathname==='/community'?host:null;
    if(selector.includes('nav'))return header;
    return null;
  }};
  vm.runInNewContext(script,{document,location:{pathname,search:'?communityId=c1'},sessionStorage:{getItem:()=> 'test-session'},localStorage:{getItem:()=>null},URLSearchParams,MutationObserver:class{observe(){}},setInterval(){},fetch:async()=>({ok:true,json:async()=>access})});
  await new Promise(resolve=>setImmediate(resolve));
  return {host,header,nodes};
}
const scope={community_id:'c1',name:'Test community',enabled:true,tenant_enabled:true};
test('Heritage is a service-catalogue entry, never a global link or heading',async()=>{
  const {host,header,nodes}=await render('/dashboard/platform-admin',{platform:true,scopes:[],subscriptions:[],invitations:[]});
  assert.equal(host.children.length,1);
  assert(!nodes.some(n=>/^h[1-6]$/.test(n.tag)));
  assert(!header.children.some(n=>n.href==='/dashboard/heritage'));
  assert.equal(host.children[0].querySelector('a').href,'/dashboard/heritage');
});
test('members see enabled Heritage in Services and subscribers can open their tree',async()=>{
  const access={platform:false,scopes:[scope],subscriptions:[],invitations:[]};
  assert.equal((await render('/dashboard/member',access)).host.children.length,1);
  assert.equal((await render('/community',access)).host.children.length,0);
  access.subscriptions=[{communityId:'c1',status:'active'}];
  const {host}=await render('/community',access);
  assert.equal(host.children[0].querySelector('a').href,'/dashboard/heritage?communityId=c1');
});
test('disabled scopes and signed-out pages do not advertise the service',async()=>{
  const access={platform:false,scopes:[{...scope,tenant_enabled:false}],subscriptions:[],invitations:[]};
  assert.equal((await render('/dashboard/member',access)).host.children.length,0);
  assert.equal((await render('/login',access)).host.children.length,0);
});

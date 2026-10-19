import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAdminDestinations,attachPlatformReturnLink} from '../../frontend/public/admin-navigation.js';

test('accounting has a direct platform return link only for verified platform administrators',()=>{
  let link=null;
  const doc={querySelector:()=>link,createElement:()=>({dataset:{},style:{},setAttribute(){},remove(){link=null;}})};
  const header={append(node){link=node;}};
  attachPlatformReturnLink(header,['Accountant'],'/dashboard/accounting',doc);
  assert.equal(link,null);
  attachPlatformReturnLink(header,['Platform Admin'],'/dashboard/accounting',doc);
  assert.equal(link.href,'/dashboard/platform-admin');
  assert.equal(link.textContent,'Platform Admin');
  const first=link;
  attachPlatformReturnLink(header,['Platform Admin'],'/dashboard/accounting',doc);
  assert.equal(link,first);
  attachPlatformReturnLink(header,[],'/dashboard/accounting',doc);
  assert.equal(link,null);
  attachPlatformReturnLink(header,['Platform Admin'],'/login',doc);
  assert.equal(link,null);
});
test('platform administrators can navigate all supplied scopes without membership requirements',()=>{
  const groups=buildAdminDestinations(['Platform Admin'],[{id:'t1',name:'Tenant One'},{id:'t2',name:'Empty tenant'}],[{id:'c1',tenantId:'t1',name:'Community One',platformCommunityId:'community-one'}],[{name:'Heritage',dashboardRoute:'/dashboard/heritage'}]);
  assert.equal(groups.find(g=>g.label==='Tenants').items.length,2);
  assert.equal(groups.find(g=>g.label==='Communities').items[0][1],'/dashboard/platform-admin?communityId=community-one');
  assert(groups[0].items.some(([,url])=>url==='/dashboard/treasury'));
  assert.equal(groups.find(g=>g.label==='Service dashboards').items[0][0],'Heritage');
});
test('ordinary members and tenant administrators receive no platform navigation',()=>{
  for(const role of ['Member','Tenant Admin','Community Admin'])assert.deepEqual(buildAdminDestinations([role],[],[]),[]);
});
test('service links reject external and executable destinations',()=>{
  assert(!buildAdminDestinations(['Platform Admin'],[],[],[{name:'Bad',dashboardRoute:'javascript:alert(1)'},{name:'External',dashboardRoute:'https://other.test/'}]).some(g=>g.label==='Service dashboards'));
});

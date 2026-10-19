import test from 'node:test';
import assert from 'node:assert/strict';
import { wholesaleCommand, wholesaleView, wholesaleQuote, paidWholesaleAccess } from '../src/wholesaler-orders.js';
const paid = {serviceCode:'marketplace',tenantId:'a',communityId:'ca',provider:'cycle',status:'active',amountCents:2500,paidUntil:'2026-12-01T00:00:00Z'};
const command = (s,u,a,b,n) => wholesaleCommand(s,u,a,b,n,{'3':[paid],'4':[paid]});
const now=new Date('2026-10-18T00:00:00Z');
function fixture(type='quantity') {
  const s={users:[{id:1,status:'active',roles:['Platform Admin']},{id:2,status:'active',roles:['Tenant Staff']},...[3,4,5].map(id=>({id,status:'active',roles:['Member']}))],tenantAccessDirectory:[{id:'a'},{id:'b'}],tenantStaff:[{userId:'2',tenantId:'a',status:'active',permissions:['users.manage']}],importedCommunities:[{id:'ca',tenantId:'a'},{id:'cb',tenantId:'b'}],memberCommunities:[{memberId:'3',communityId:'ca',tenantId:'a'},{memberId:'4',communityId:'ca',tenantId:'a'},{memberId:'5',communityId:'cb',tenantId:'b'}],cycleServiceAvailability:{tenants:[{id:'a',serviceCodes:['marketplace']},{id:'b',serviceCodes:['marketplace']}],communities:[{id:'ca',tenantId:'a',serviceCodes:['marketplace']},{id:'cb',tenantId:'b',serviceCodes:['marketplace']}]},wallets:[{balance:123}]};
  const supplier=command(s,2,'supplier',{tenantId:'a',name:'Synthetic wholesaler',contact:'Manual only',active:true},now);
  const offer=command(s,2,'offer',{supplierId:supplier.id,product:'Rice',unit:'case',unitPriceCents:10000,thresholdType:type,threshold:type==='quantity'?10:100000,discountBps:1250,closesAt:'2026-12-01T00:00:00Z'},now);
  for(const user of [3,4]){const application=command(s,user,'apply',{communityId:'ca',supplierId:supplier.id,businessName:'Test business'},now);command(s,2,'review',{id:application.id,status:'approved',supplierReference:'SYNTHETIC-'+user},now);}
  return {s,offer,supplier};
}
const order=(s,o,user,quantity,mode='group',key='request-'+user+'-000000000')=>command(s,user,'order',{communityId:'ca',offerId:o.id,quantity,mode,requestId:key},now);
for(const type of ['quantity','value'])test(type+' threshold aggregates traders and locks exact discounted totals once',()=>{
  const {s,offer}=fixture(type),a=order(s,offer,3,4);assert.equal(a.quote,null);
  assert.throws(()=>command(s,2,'close-group',{offerId:offer.id,communityId:'ca'},now),{status:409});
  order(s,offer,4,6);command(s,2,'close-group',{offerId:offer.id,communityId:'ca'},now);
  assert.equal(s.wholesalerOrders.orders[0].quote.totalCents,35000);assert.equal(s.wholesalerOrders.orders[1].quote.totalCents,52500);
  assert.equal(wholesaleView(s,3,undefined,'ca').groups[0].quantity,10);
  assert.throws(()=>command(s,3,'status',{id:a.id,status:'cancelled'},now),{status:409});
  assert.throws(()=>command(s,2,'close-group',{offerId:offer.id,communityId:'ca'},now),{status:409});
  assert.throws(()=>order(s,offer,3,1,'group','another-request-000000'),{status:409});assert.deepEqual(s.wallets,[{balance:123}]);
});
test('individual price threshold and integer rounding',()=>{const {s,offer}=fixture();assert.equal(order(s,offer,3,10,'individual').quote.totalCents,87500);assert.equal(wholesaleQuote({...offer,unitPriceCents:101,threshold:1,discountBps:3333},1).totalCents,68);});
test('request replay is idempotent and mismatched payload rejected',()=>{const {s,offer}=fixture();const a=order(s,offer,3,2);assert.equal(order(s,offer,3,2).id,a.id);assert.throws(()=>order(s,offer,3,3),{status:409});assert.equal(s.wholesalerOrders.orders.length,1);});
test('membership, supplier approval and enabled marketplace are required',()=>{const {s,offer}=fixture();assert.throws(()=>command(s,5,'order',{communityId:'cb',offerId:offer.id,quantity:1,mode:'group',requestId:'outside-000000000000'},now),{status:403});s.wholesalerOrders.applications[0].status='rejected';assert.throws(()=>order(s,offer,3,1),{status:403});s.cycleServiceAvailability.tenants[0].serviceCodes=[];assert.throws(()=>wholesaleView(s,3,undefined,'ca'),{status:403});});
test('tenant management denied across tenants and after revocation',()=>{const {s}=fixture();assert.throws(()=>wholesaleView(s,2,'b'),{status:403});s.tenantStaff[0].status='revoked';assert.throws(()=>command(s,2,'supplier',{tenantId:'a',name:'Denied',contact:'',active:true},now),{status:403});});
test('members see their own applications/orders and aggregate group totals only',()=>{const {s,offer}=fixture();order(s,offer,3,4);order(s,offer,4,6);const view=wholesaleView(s,3,undefined,'ca');assert.equal(view.orders.length,1);assert.equal(view.applications.length,1);assert.equal(view.groups[0].traders,2);assert.equal(view.groups[0].quantity,10);assert(!JSON.stringify(view).includes('SYNTHETIC-4'));});
test('account review and order handling require administrator',()=>{const {s,offer}=fixture();const o=order(s,offer,3,1,'individual');assert.throws(()=>command(s,3,'status',{id:o.id,status:'submitted_manual',supplierReference:'X'},now),{status:409});assert.throws(()=>command(s,2,'status',{id:o.id,status:'submitted_manual',supplierReference:''},now),{status:400});command(s,2,'status',{id:o.id,status:'submitted_manual',supplierReference:'MANUAL-1'},now);command(s,2,'status',{id:o.id,status:'fulfilled'},now);assert.equal(o.status,'fulfilled');assert.throws(()=>command(s,2,'status',{id:o.id,status:'cancelled'},now),{status:409});});
test('cancel before closure removes contribution and no other member can cancel',()=>{const {s,offer}=fixture();const a=order(s,offer,3,4);order(s,offer,4,6);assert.throws(()=>command(s,4,'status',{id:a.id,status:'cancelled'},now),{status:403});command(s,3,'status',{id:a.id,status:'cancelled'},now);assert.equal(wholesaleView(s,4,undefined,'ca').groups[0].quantity,6);});
test('offer prices lock once ordered and invalid quantities fail',()=>{const {s,offer}=fixture();for(const q of [0,-1,1.5,1000001])assert.throws(()=>order(s,offer,3,q),{status:400});order(s,offer,3,1);assert.throws(()=>command(s,2,'offer',{...offer,unitPriceCents:1},now),{status:409});});
test('expired offers reject requests without creating orders',()=>{const {s,offer}=fixture();offer.closesAt='2026-01-01T00:00:00Z';assert.throws(()=>order(s,offer,3,1),{status:409});assert.equal(s.wholesalerOrders.orders.length,0);});
test('unpaid traders browse normal prices and cannot obtain discounts through order payloads',()=>{
  const {s,offer}=fixture();
  const view=wholesaleView(s,3,undefined,'ca',[],now);
  assert.equal(view.discountEligible,false);assert.equal(view.offers[0].discountBps,0);
  const o=wholesaleCommand(s,3,'order',{communityId:'ca',offerId:offer.id,quantity:10,mode:'individual',requestId:'unpaid-request-00001',discountEligible:true},now);
  assert.equal(o.quote.totalCents,100000);assert.equal(o.discountEligible,false);
  assert.equal(wholesaleView(s,3,undefined,'ca',[paid],now).offers[0].discountBps,1250);
});
test('only settled paid access in the matching scope qualifies',()=>{
  assert.equal(paidWholesaleAccess([paid],'a','ca',now),true);
  for(const change of [{amountCents:0},{status:'pending'},{provider:'test'},{paidUntil:'2026-01-01'},{paidUntil:null},{tenantId:'b'},{communityId:'cb'},{serviceCode:'jobs'}])assert.equal(paidWholesaleAccess([{...paid,...change}],'a','ca',now),false);
});
test('group closure rechecks payment for each participant',()=>{
  const {s,offer}=fixture();order(s,offer,3,4);order(s,offer,4,6);
  wholesaleCommand(s,2,'close-group',{offerId:offer.id,communityId:'ca'},now,{'3':[paid],'4':[{...paid,paidUntil:'2026-01-01'}]});
  assert.equal(s.wholesalerOrders.orders[0].quote.totalCents,35000);
  assert.equal(s.wholesalerOrders.orders[1].quote.totalCents,60000);
});
test('existing members can browse normal prices before payment availability is published',()=>{
  const {s}=fixture();delete s.cycleServiceAvailability;
  const view=wholesaleView(s,3,undefined,'ca',[],now);
  assert.equal(view.discountEligible,false);assert.equal(view.offers.length,1);assert.equal(view.offers[0].discountBps,0);
  assert.throws(()=>wholesaleView(s,5,undefined,'ca'),{status:403});
});

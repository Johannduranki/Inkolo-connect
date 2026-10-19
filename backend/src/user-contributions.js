export function userContributions(rows,userId,names={}){
  const subscriptions=rows.filter(s=>String(s.userId)===String(userId)).map(s=>{
    const amountCents=Number.isSafeInteger(s.amountCents)&&s.amountCents>=0?s.amountCents:null;
    const billingCycle=String(s.billingCycle||s.billingPeriod||(s.planCode==='monthly'?'monthly':'')).toLowerCase();
    const monthlyAmountCents=amountCents===0||['once','one-off','one-time'].includes(billingCycle)?0:billingCycle==='monthly'?amountCents:null;
    return {serviceCode:s.serviceCode,serviceName:names[s.serviceCode]||s.serviceName||s.serviceCode,planLabel:s.planLabel||s.planCode,status:s.status,subscribedAt:s.subscribedAt,communityId:s.communityId||null,currency:s.currency||'ZAR',amountCents,billingCycle:billingCycle||'Not recorded',monthlyAmountCents};
  });
  const active=subscriptions.filter(s=>String(s.status).toLowerCase()==='active');
  const totals={};
  for(const s of active)if(s.monthlyAmountCents!==null)totals[s.currency]=(totals[s.currency]||0)+s.monthlyAmountCents;
  return {subscriptions,monthlyContribution:{totals,incomplete:active.some(s=>s.monthlyAmountCents===null),hasRecords:subscriptions.length>0,activeCount:active.length}};
}

import { platformAdmin } from './tenant-access.js';

export const commissionServices = new Set(['marketplace', 'keycha-properties']);
const fail = (status, message) => { throw Object.assign(Error(message), {status}); };

export function salesCommission(state, code) {
  if (!commissionServices.has(code)) return null;
  const saved = state.salesCommissions?.[code];
  return {rateBps:saved?.rateBps ?? null,revision:saved?.revision || 0,basis:'sale-price',beneficiary:'duranki',collection:'not-connected'};
}

export function saveSalesCommission(state, actorId, code, body) {
  if (!platformAdmin(state.users?.find(u=>String(u.id)===String(actorId)))) fail(403,'Only Duranki Platform Admin may configure Duranki sales commission.');
  if (!commissionServices.has(code)) fail(404,'Sales commission is not available for this service.');
  if (!Number.isSafeInteger(body?.rateBps) || body.rateBps < 0 || body.rateBps > 10000) fail(400,'Enter a commission from 0% to 100%, with at most two decimal places.');
  if (!Number.isSafeInteger(body.revision) || body.revision < 0) fail(400,'Valid commission revision required.');
  const previous=state.salesCommissions?.[code];
  if ((previous?.revision || 0)!==body.revision) fail(409,'Commission changed. Refresh before saving.');
  const saved={rateBps:body.rateBps,revision:body.revision+1,updatedBy:String(actorId),updatedAt:new Date().toISOString()};
  (state.salesCommissions??={})[code]=saved;
  (state.salesCommissionAudit??=[]).push({code,before:previous||null,after:saved});
  return salesCommission(state,code);
}

// Quote only: listing a price or marking an item sold is not proof of payment.
export function salesCommissionQuote(state, code, salePriceCents) {
  const commission=salesCommission(state,code);
  if (!commission || commission.rateBps===null) fail(409,'Duranki sales commission has not been configured.');
  if (!Number.isSafeInteger(salePriceCents) || salePriceCents<0) fail(400,'A valid sale price in cents is required.');
  const durankiCents=Number((BigInt(salePriceCents)*BigInt(commission.rateBps)+5000n)/10000n);
  return {...commission,salePriceCents,durankiCents,sellerRemainderCents:salePriceCents-durankiCents,currency:'ZAR',estimate:true};
}

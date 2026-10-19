import express from 'express';
import { randomUUID } from 'node:crypto';
import { permissionsFor, tenantDirectory, platformAdmin } from './tenant-access.js';
import { resolveCommunityConfiguration } from '../../frontend/public/tenant-service-policy.js';

const fail = (status, message) => { throw Object.assign(Error(message), { status }); };
const text = (value, max, required = true) => {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) fail(400, 'Enter valid text fields.');
  return value.trim();
};
const integer = (value, min, max) => { if (!Number.isSafeInteger(value) || value < min || value > max) fail(400, 'Enter a valid whole number.'); return value; };
const actor = (state, id) => { const user = state.users.find(u => String(u.id) === String(id)); if (user?.status !== 'active') fail(403, 'Active account required.'); return user; };
const manages = (state, user, tenantId) => permissionsFor(state, user, tenantId).includes('users.manage');
const admin = (state, user, tenantId) => { if (!manages(state, user, tenantId)) fail(403, 'Tenant administrator access required.'); };
const store = state => state.wholesalerOrders || { suppliers: [], offers: [], applications: [], orders: [], groups: [], audit: [] };
export const paidWholesaleAccess = (subscriptions, tenantId, communityId, now = new Date()) => subscriptions.some(s =>
  ['marketplace','build-up-balance'].includes(s.serviceCode) && s.tenantId === tenantId && s.communityId === communityId &&
  s.provider === 'cycle' && s.status === 'active' && s.amountCents > 0 && new Date(s.paidUntil) > now);
function memberScope(state, user, communityId) {
  const membership = (state.memberCommunities || []).find(m => String(m.memberId) === String(user.id) && (m.communityId || m.churchId) === communityId);
  const policy = state.cycleServiceAvailability;
  const config = membership && resolveCommunityConfiguration(membership, policy?.communities, policy?.tenants);
  if (!membership || !tenantDirectory(state).some(t => t.id === membership.tenantId)) fail(403, 'Join this community before browsing wholesalers.');
  // A missing published payment policy must not hide manual browsing from existing members.
  // Once published, explicit tenant/community restrictions remain authoritative.
  if (policy && !config?.serviceCodes?.some(c => ['marketplace', 'build-up-balance'].includes(c))) fail(403, 'Buy and Sell is not enabled for this community.');
  return membership.tenantId;
}
function find(rows, id) { const row = rows.find(r => r.id === id); if (!row) fail(404, 'Record not found.'); return row; }
export function wholesaleQuote(offer, quantity, groupQuantity = quantity) {
  const subtotalCents = offer.unitPriceCents * quantity;
  const progress = offer.thresholdType === 'quantity' ? groupQuantity : groupQuantity * offer.unitPriceCents;
  const qualified = progress >= offer.threshold;
  const discountCents = qualified ? Math.floor(subtotalCents / 10000) * offer.discountBps + Math.floor((subtotalCents % 10000) * offer.discountBps / 10000) : 0;
  return { subtotalCents, discountCents, totalCents: subtotalCents - discountCents, qualified, progress, threshold: offer.threshold };
}
function pendingGroup(data, offerId, communityId) { return data.orders.filter(o => o.offerId === offerId && o.communityId === communityId && o.mode === 'group' && o.status === 'collecting'); }
function groupView(data, offer, communityId) {
  const closed = data.groups.find(g => g.offerId === offer.id && g.communityId === communityId);
  const rows = closed ? data.orders.filter(o => o.offerId === offer.id && o.communityId === communityId && o.closedAt === closed.closedAt) : pendingGroup(data, offer.id, communityId);
  const quantity = closed?.quantity ?? rows.reduce((n, o) => n + o.quantity, 0);
  return { offerId: offer.id, communityId, quantity, traders: new Set(rows.map(o => o.userId)).size, ...wholesaleQuote(offer, quantity, quantity), closed: data.groups.some(g => g.offerId === offer.id && g.communityId === communityId) };
}
export function wholesaleView(state, userId, tenantId, communityId, subscriptions = [], now = new Date()) {
  const user = actor(state, userId), data = store(state);
  const tenants = tenantDirectory(state).filter(t => manages(state, user, t.id));
  const communities = (state.memberCommunities || []).filter(m => String(m.memberId) === String(user.id)).filter(m => {
    try { memberScope(state, user, m.communityId || m.churchId); return true; } catch { return false; }
  }).map(m => ({ id: m.communityId || m.churchId, name: m.communityName || m.churchName || m.communityId, tenantId: m.tenantId }));
  if (!tenantId && !communityId) return { tenants, communities, platformAdmin: platformAdmin(user) };
  const isAdmin = !!tenantId;
  if (isAdmin) admin(state, user, tenantId); else tenantId = memberScope(state, user, communityId);
  const discountEligible = isAdmin || paidWholesaleAccess(subscriptions, tenantId, communityId, now);
  const suppliers = data.suppliers.filter(s => s.tenantId === tenantId && (isAdmin || s.active));
  const offers = data.offers.filter(o => suppliers.some(s => s.id === o.supplierId)).map(o => discountEligible ? o : {...o, discountBps: 0});
  const orders = data.orders.filter(o => o.tenantId === tenantId && (isAdmin || (o.userId === String(user.id) && o.communityId === communityId)));
  const applications = data.applications.filter(a => a.tenantId === tenantId && (isAdmin || a.userId === String(user.id)));
  const scopes = isAdmin ? (state.importedCommunities || []).filter(c => c.tenantId === tenantId).map(c => c.platformCommunityId || c.id) : [communityId];
  return { admin: isAdmin, discountEligible, tenantId, suppliers, offers, applications, orders, groups: offers.flatMap(o => scopes.map(c => groupView(data, o, c))), fulfilment: 'manual' };
}
export function wholesaleCommand(state, userId, action, body, now = new Date(), subscriptionsByUser = {}) {
  const user = actor(state, userId);
  const data = state.wholesalerOrders ??= { suppliers: [], offers: [], applications: [], orders: [], groups: [], audit: [] };
  const stamp = now.toISOString(); let result;
  if (action === 'supplier') {
    admin(state, user, body.tenantId);
    const existing = body.id ? find(data.suppliers, body.id) : null;
    if (existing && existing.tenantId !== body.tenantId) fail(403, 'Wrong tenant.');
    if (existing && body.revision !== existing.revision) fail(409, 'Supplier changed. Refresh before saving.');
    if (typeof body.active !== 'boolean') fail(400, 'Choose supplier availability.');
    const name = text(body.name, 120), contact = text(body.contact, 200, false);
    result = { id: existing?.id || randomUUID(), tenantId: body.tenantId, name, contact, active: body.active, fulfilment: 'manual', revision: (existing?.revision || 0) + 1 };
    if (existing) Object.assign(existing, result); else data.suppliers.push(result);
  } else if (action === 'offer') {
    const supplier = find(data.suppliers, body.supplierId); admin(state, user, supplier.tenantId);
    const existing = body.id ? find(data.offers, body.id) : null;
    if (existing && existing.supplierId !== supplier.id) fail(403, 'Wrong supplier.');
    if (existing && (body.revision !== existing.revision || data.orders.some(o => o.offerId === existing.id))) fail(409, 'An offer with orders is locked. Create a new offer.');
    if (!['quantity', 'value'].includes(body.thresholdType)) fail(400, 'Choose quantity or order value.');
    const closesAt = new Date(body.closesAt);
    if (!Number.isFinite(closesAt.getTime()) || closesAt <= now) fail(400, 'Choose a future closing date.');
    result = { id: existing?.id || randomUUID(), supplierId: supplier.id, tenantId: supplier.tenantId, product: text(body.product, 160), unit: text(body.unit, 60), unitPriceCents: integer(body.unitPriceCents, 1, 100000000), discountBps: integer(body.discountBps, 1, 10000), thresholdType: body.thresholdType, threshold: integer(body.threshold, 1, body.thresholdType === 'quantity' ? 1000000 : 10000000000), closesAt: closesAt.toISOString(), revision: (existing?.revision || 0) + 1 };
    if (existing) Object.assign(existing, result); else data.offers.push(result);
  } else if (action === 'apply') {
    const tenantId = memberScope(state, user, body.communityId), supplier = find(data.suppliers, body.supplierId);
    if (!supplier.active || supplier.tenantId !== tenantId) fail(403, 'Supplier unavailable in this tenant.');
    const old = data.applications.find(a => a.supplierId === supplier.id && a.userId === String(user.id));
    if (old) return old;
    result = { id: randomUUID(), supplierId: supplier.id, tenantId, userId: String(user.id), businessName: text(body.businessName, 160), status: 'pending', supplierReference: '', createdAt: stamp };
    data.applications.push(result);
  } else if (action === 'review') {
    result = find(data.applications, body.id); admin(state, user, result.tenantId);
    if (result.status !== 'pending') fail(409, 'Application already reviewed.');
    if (!['approved', 'rejected'].includes(body.status)) fail(400, 'Choose approved or rejected.');
    const reference = text(body.supplierReference || '', 160, body.status === 'approved');
    Object.assign(result, { status: body.status, supplierReference: reference, reviewedAt: stamp });
  } else if (action === 'order') {
    const tenantId = memberScope(state, user, body.communityId), offer = find(data.offers, body.offerId), supplier = find(data.suppliers, offer.supplierId);
    if (offer.tenantId !== tenantId || !supplier.active) fail(403, 'Offer unavailable in this tenant.');
    const quantity = integer(body.quantity, 1, 1000000), requestId = text(body.requestId, 80);
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(requestId) || !['individual','group'].includes(body.mode)) fail(400, 'Invalid order request.');
    const old = data.orders.find(o => o.userId === String(user.id) && o.requestId === requestId);
    if (old) {
      if (old.offerId !== offer.id || old.communityId !== body.communityId || old.quantity !== quantity || old.mode !== body.mode) fail(409, 'Order request already used with different details.');
      return old;
    }
    if (!data.applications.some(a => a.userId === String(user.id) && a.supplierId === supplier.id && a.status === 'approved')) fail(403, 'An approved supplier account is required.');
    if (new Date(offer.closesAt) <= now) fail(409, 'This offer has closed.');
    if (body.mode === 'group' && data.groups.some(g => g.offerId === offer.id && g.communityId === body.communityId)) fail(409, 'This group has already closed.');
    const groupQuantity = pendingGroup(data, offer.id, body.communityId).reduce((n, o) => n + o.quantity, quantity);
    if (groupQuantity > 1000000) fail(400, 'Group quantity limit reached.');
    result = { id: randomUUID(), requestId, tenantId, communityId: body.communityId, userId: String(user.id), supplierId: supplier.id, supplierName: supplier.name, offerId: offer.id, product: offer.product, unit: offer.unit, unitPriceCents: offer.unitPriceCents, quantity, mode: body.mode, status: body.mode === 'group' ? 'collecting' : 'ready_manual', quote: body.mode === 'individual' ? wholesaleQuote(offer, quantity) : null, supplierReference: '', createdAt: stamp };
    result.discountEligible = paidWholesaleAccess(subscriptionsByUser[String(user.id)] || [], tenantId, body.communityId, now);
    if (body.mode === 'individual' && !result.discountEligible) result.quote = wholesaleQuote({...offer, discountBps: 0}, quantity);
    data.orders.push(result);
  } else if (action === 'close-group') {
    const offer = find(data.offers, body.offerId); admin(state, user, offer.tenantId);
    if (data.groups.some(g => g.offerId === offer.id && g.communityId === body.communityId)) fail(409, 'Group already closed.');
    const rows = pendingGroup(data, offer.id, body.communityId), quantity = rows.reduce((n, o) => n + o.quantity, 0);
    if (!rows.length || !wholesaleQuote(offer, quantity).qualified) fail(409, 'The group has not reached the discount threshold.');
    for (const order of rows) {
      const eligible = paidWholesaleAccess(subscriptionsByUser[order.userId] || [], order.tenantId, order.communityId, now);
      Object.assign(order, { discountEligible: eligible, quote: wholesaleQuote(eligible ? offer : {...offer, discountBps: 0}, order.quantity, quantity), status: 'ready_manual', closedAt: stamp });
    }
    result = { id: randomUUID(), offerId: offer.id, communityId: body.communityId, quantity, closedAt: stamp }; data.groups.push(result);
  } else if (action === 'status') {
    result = find(data.orders, body.id);
    const canManage = manages(state, user, result.tenantId), own = result.userId === String(user.id);
    if (!canManage && !own) fail(403, 'Order access denied.');
    if (!canManage && result.mode === 'group' && result.closedAt) fail(409, 'This group is locked. Contact the tenant administrator to change it.');
    const transitions = { collecting: ['cancelled'], ready_manual: ['submitted_manual','cancelled'], submitted_manual: ['fulfilled','cancelled'] };
    if (!transitions[result.status]?.includes(body.status) || (!canManage && !(body.status === 'cancelled' && ['collecting','ready_manual'].includes(result.status)))) fail(409, 'This order transition is not allowed.');
    if (body.status === 'submitted_manual') result.supplierReference = text(body.supplierReference, 160);
    Object.assign(result, { status: body.status, updatedAt: stamp });
  } else fail(404, 'Unknown action.');
  data.audit.push({ id: randomUUID(), actorId: String(user.id), action, recordId: result.id, at: stamp });
  return result;
}
export function createWholesalerRouter({ requireAuth, readState, updateState, databaseAvailable, paidSubscriptions = async () => [] }) {
  const router = express.Router(); router.use(requireAuth);
  router.use((_req,res,next) => databaseAvailable ? res.status(503).json({ message: 'Wholesaler storage requires the platform document adapter.' }) : next());
  router.get('/', async(req,res,next) => { try { res.json(wholesaleView(readState(),req.auth.sub,req.query.tenantId,req.query.communityId,await paidSubscriptions(req.auth.sub))); } catch(e) { next(e); } });
  router.post('/:action', async(req,res,next) => { try {
    const body = req.body || {}, subscriptions = {};
    const ids = new Set([String(req.auth.sub)]);
    if (req.params.action === 'close-group') {
      const state = readState(), offer = find(store(state).offers, body.offerId);
      admin(state, actor(state, req.auth.sub), offer.tenantId);
      for (const order of pendingGroup(store(state), body.offerId, body.communityId)) ids.add(order.userId);
    }
    if (['order','close-group'].includes(req.params.action)) for (const id of ids) subscriptions[id] = await paidSubscriptions(id);
    res.json(await updateState(state => wholesaleCommand(state,req.auth.sub,req.params.action,body,new Date(),subscriptions)));
  } catch(e) { next(e); } });
  router.use((error,_req,res,next) => error.status ? res.status(error.status).json({message:error.message}) : next(error));
  return router;
}

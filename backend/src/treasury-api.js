import express from 'express';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { hashPassword } from './password-security.js';
import { TreasuryStore } from './treasury-store.js';

export function createTreasuryRouter({ requireAuth, resolveUser, findUser, store }) {
  if (!store) {
    const directory = fileURLToPath(new URL('../data/', import.meta.url));
    mkdirSync(directory, { recursive: true });
    store = new TreasuryStore(path.join(directory, 'treasury.sqlite'));
  }
  const router = express.Router();
  router.use(requireAuth);
  router.use(async (req, res, next) => {
    try {
      const user = await resolveUser(req.auth.sub,req.auth);
      if (!user || user.status !== 'active') return res.status(403).json({ message: 'Treasury access is not assigned to this account.' });
      const roles = user.roles || [];
      req.treasuryAdmin = roles.includes('Platform Admin');
      req.canApprove = req.treasuryAdmin || roles.includes('Treasury Approver');
      if (!req.canApprove && !roles.includes('Treasury Operator')) return res.status(403).json({ message: 'Treasury access is not assigned to this account.' });
      res.set('Cache-Control', 'no-store');
      next();
    } catch (error) { next(error); }
  });
  const text = (body, key) => {
    const value = typeof body[key] === 'string' ? body[key].trim() : '';
    if (!value || value.length > 200) throw new Error(`Enter ${key.replaceAll('_', ' ')} (maximum 200 characters).`);
    return value;
  };
  router.get('/', async (req, res) => res.json({ ...await store.snapshot(), staff: req.treasuryAdmin ? await store.activeStaff() : [], userId: String(req.auth.sub), admin: req.treasuryAdmin, canApprove: req.canApprove }));
  router.post('/staff', async (req,res,next) => {
    try {
      if (!req.treasuryAdmin) return res.sendStatus(403);
      const userId=text(req.body,'user_id');
      if (userId === String(req.auth.sub)) throw new Error('Use a different account for Treasury staff.');
      const user=await findUser(userId);
      if (!user || user.status !== 'active' || user.roles?.includes('Platform Admin')) throw new Error('Choose an existing active non-administrator account.');
      const role=text(req.body,'role');
      if (!['Treasury Operator','Treasury Approver'].includes(role)) throw new Error('Choose a valid Treasury role.');
      const hash=await hashPassword(req.body.password);
      const actor=await resolveUser(req.auth.sub,req.auth),target=await findUser(userId);
      if (actor?.status !== 'active' || !actor.roles?.includes('Platform Admin')) return res.sendStatus(403);
      if (target?.status !== 'active' || target.roles?.includes('Platform Admin')) return res.status(409).json({message:'Staff account changed. Refresh and try again.'});
      await store.assignStaff(userId,role,hash,req.auth.sub);
      res.status(201).json({ok:true});
    } catch(error) {next(error);}
  });
  router.post('/staff/:id/revoke', async (req,res)=>{
    if(!req.treasuryAdmin)return res.sendStatus(403);
    // Retain the password requirement even when Treasury permission is revoked.
    await store.revokeStaff(req.params.id,req.auth.sub);
    res.json({ok:true});
  });
  router.post('/scopes', async (req, res) => {
    if (!req.treasuryAdmin) return res.sendStatus(403);
    const b = req.body, id = randomUUID();
    const values = Object.fromEntries(['tenant_id','tenant_name','community_id','community_name'].map(key => [key,text(b,key)]));
    await store.addScope(id,values,req.auth.sub);
    res.status(201).json({ id });
  });
  router.post('/parties', async (req, res) => {
    if (!req.treasuryAdmin) return res.sendStatus(403);
    const b = req.body, id = randomUUID();
    if (!Number.isInteger(b.share_bps) || b.share_bps < 1 || b.share_bps > 10000) throw new Error('Stakeholder share must be between 0.01% and 100%.');
    await store.addParty(id,{name:text(b,'name'),service_id:text(b,'service_id'),beneficiary_reference:text(b,'beneficiary_reference'),share_bps:b.share_bps},req.auth.sub);
    res.status(201).json({ id });
  });
  router.post('/receipts', async (req, res) => {
    const b = req.body, values = { received_cents: b.received_cents };
    for (const key of ['scope_id','party_id','user_id','member_name','reference','received_on']) values[key] = text(b,key);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.received_on) || !Number.isFinite(Date.parse(values.received_on)) || values.received_on > new Date().toISOString().slice(0,10)) throw new Error('Enter a valid received date, not in the future.');
    res.status(201).json({ id: await store.receipt(values,req.auth.sub) });
  });
  router.post('/payments', async (req,res) => res.status(201).json({ id: await store.draft(req.body.receipt_ids,req.auth.sub) }));
  router.post('/payments/:id/:action', async (req,res) => {
    if (['approve','settle'].includes(req.params.action) && !req.canApprove) return res.sendStatus(403);
    if (req.params.action === 'settle') {
      text(req.body,'bank_reference'); text(req.body,'settled_on');
      if (!Number.isFinite(Date.parse(req.body.settled_on)) || req.body.settled_on > new Date().toISOString().slice(0,10)) throw new Error('Enter a valid settlement date, not in the future.');
    }
    await store.transition(req.params.id,req.params.action,req.auth.sub,req.body.bank_reference?.trim(),req.body.settled_on);
    res.json({ ok: true });
  });
  router.get('/payments/:id/instruction', async (req,res) => {
    const payment = (await store.snapshot()).payments.find(p => p.id === req.params.id);
    if (!payment || payment.status !== 'APPROVED') return res.status(409).json({ message: 'Only approved payments have payment instructions.' });
    const cell = value => '"' + String(value).replace(/^[=+@\-\t\r]/, "' $&").replaceAll('"','""') + '"';
    await store.audit(req.auth.sub,'INSTRUCTION_EXPORTED',payment.id);
    res.type('text/csv').attachment(`treasury-${payment.id}.csv`).send('Payment ID,Stakeholder,Beneficiary reference,Currency,Amount\r\n' + [payment.id,payment.party_name,payment.beneficiary_reference,'ZAR',(payment.amount_cents/100).toFixed(2)].map(cell).join(','));
  });
  router.use((error,req,res,next) => {
    if ([400,403,409,503].includes(error.status)) return res.status(error.status).json({message:error.message});
    if (error.code?.startsWith('ERR_SQLITE') || ['ER_DUP_ENTRY','ER_NO_REFERENCED_ROW_2','ER_CHECK_CONSTRAINT_VIOLATED','ER_CONSTRAINT_FAILED'].includes(error.code)) return res.status(409).json({ message: 'This reference or receipt is already recorded, or the record conflicts with a database constraint.' });
    if (error.code) return res.status(503).json({ message: 'Treasury storage is temporarily unavailable. No success has been confirmed.' });
    res.status(400).json({ message: error.message || 'Unable to save treasury record.' });
  });
  return router;
}

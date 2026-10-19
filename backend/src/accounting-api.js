import express from 'express';
import { randomUUID } from 'node:crypto';
import { readPlatformState, updatePlatformState } from './platform-store.js';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const text = (value, name, max = 160) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(400, `Enter a valid ${name}.`);
  return value.trim();
};
const amount = value => {
  if (!['number','string'].includes(typeof value) || String(value).trim() === '') fail(400, 'Enter valid non-negative amounts with at most two decimal places.');
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100000000 || Math.abs(number * 100 - Math.round(number * 100)) > 0.000001) fail(400, 'Enter valid non-negative amounts with at most two decimal places.');
  return Math.round(number * 100) / 100;
};

export function accountingSnapshot(state) {
  return Object.fromEntries(['Employees','SupplierInvoices','TenantInvoices','LedgerEntries','FundMovements','Payments','ScopeCodes'].map(key => [key[0].toLowerCase()+key.slice(1), state['accounting'+key] ?? []]));
}

function entityFor(state, scopeCode) {
  if (scopeCode === 'DUR') return 'Duranki Platform';
  const scope = (state.accountingScopeCodes ?? []).find(code => code.shortCode === scopeCode && code.status === 'ACTIVE');
  if (!scope) fail(400, 'Create an active accounting short code for this entity first.');
  return scope.name;
}

export function addAccountingEmployees(state, records, actorId) {
  if (!Array.isArray(records) || !records.length || records.length > 500) fail(400, 'Provide between 1 and 500 employees.');
  const keys = new Set((state.accountingEmployees ?? []).map(row => `${row.scopeCode}:${row.employeeNumber.toUpperCase()}`));
  const created = records.map(record => {
    const scopeCode = text(record?.scopeCode ?? 'DUR', 'scope code', 20).toUpperCase();
    const employeeNumber = text(record?.employeeNumber, 'employee number', 50);
    const key = `${scopeCode}:${employeeNumber.toUpperCase()}`;
    if (keys.has(key)) fail(409, 'An employee number is duplicated in this entity. No rows were imported.');
    keys.add(key);
    const row = {
      id: randomUUID(), fullName: text(record?.fullName, 'employee name'), employeeNumber,
      role: text(record?.role, 'job title'), scopeCode, entity: entityFor(state, scopeCode),
      grossSalary: amount(record?.grossSalary),
      ...Object.fromEntries(['employerUif','sdl','pension','medicalAid'].map(key => [key, amount(record?.[key] ?? 0)])),
      status: 'Active', createdAt: new Date().toISOString(), createdBy: String(actorId)
    };
    if (row.grossSalary === 0) fail(400, 'Gross salary must be greater than zero.');
    return row;
  });
  (state.accountingEmployees ??= []).push(...created);
  return created;
}

export function addAccountingCode(state, body, actorId) {
  const scopeType = text(body?.scopeType, 'scope type', 30).toUpperCase();
  if (!['TENANT','COMMUNITY','SERVICE_PROVIDER'].includes(scopeType)) fail(400, 'Choose a valid scope type.');
  const scopeId = text(body?.scopeId, 'scope ID', 100);
  const name = text(body?.name, 'entity name');
  const shortCode = text(body?.shortCode, 'short code', 20).toUpperCase();
  if (!/^[A-Z0-9-]{3,20}$/.test(shortCode) || shortCode === 'DUR') fail(400, 'Use a unique 3-20 character short code; DUR is reserved.');
  const codes = state.accountingScopeCodes ?? [];
  if (codes.some(code => code.shortCode === shortCode || (code.scopeId === scopeId && code.scopeType === scopeType))) fail(409, 'This scope or short code already exists.');
  const row = {id:randomUUID(),scopeType,scopeId,name,shortCode,status:'ACTIVE',createdAt:new Date().toISOString(),createdBy:String(actorId)};
  (state.accountingScopeCodes ??= []).push(row);
  return row;
}

export function createAccountingRouter({ databaseAvailable = false, readState = readPlatformState, updateState = updatePlatformState } = {}) {
  const router = express.Router();
  // Mounted behind the platform router's authenticated, MFA-checked middleware.
  router.use((req,res,next) => {
    if (databaseAvailable) return res.status(503).json({message:'SQL accounting storage has not been connected. No local fallback is allowed.'});
    const user = readState().users.find(user => String(user.id) === String(req.auth?.sub));
    if (!user || user.status !== 'active' || !user.roles?.some(role => ['Platform Admin','DURANKI_ADMIN','Accountant'].includes(role))) return res.status(403).json({message:'Platform accounting permission is required.'});
    res.set('Cache-Control','no-store');
    next();
  });
  router.get('/',(_req,res) => res.json(accountingSnapshot(readState())));
  router.get('/scope-codes',(_req,res) => res.json(readState().accountingScopeCodes ?? []));
  const save = async (req, mutator) => await updateState(state => {
    const draft = structuredClone(state);
    const result = mutator(draft);
    (draft.accountingAudit ??= []).push({id:randomUUID(),actorId:String(req.auth.sub),action:req.path,at:new Date().toISOString()});
    Object.assign(state,draft);
    return result;
  });
  router.post('/employees',async (req,res) => res.status(201).json(await save(req,state => addAccountingEmployees(state,[req.body],req.auth.sub)[0])));
  router.post('/employees/bulk',async (req,res) => {
    const created = await save(req,state => addAccountingEmployees(state,req.body?.employees,req.auth.sub));
    return res.status(201).json({created,createdCount:created.length,skippedCount:0});
  });
  router.post('/scope-codes',async (req,res) => res.status(201).json(await save(req,state => addAccountingCode(state,req.body,req.auth.sub))));
  router.use((req,res) => res.status(503).json({message:'This accounting operation is not connected to verified posting and settlement yet. No payment, invoice or reconciliation has been recorded.'}));
  router.use((error,_req,res,_next) => res.status(error.status ?? 500).json({message:error.status ? error.message : 'The accounting record could not be saved.'}));
  return router;
}

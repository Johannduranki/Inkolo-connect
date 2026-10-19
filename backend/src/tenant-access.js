import express from 'express';
import { randomUUID } from 'node:crypto';
import { hashPassword } from './password-security.js';

export const tenantPermissions = {
  'reports.view': 'Community reports',
  'tenant.view': 'Tenant overview',
  'branding.manage': 'Tenant and community logos',
  'communities.view': 'Community directory',
  'users.manage': 'Staff and permissions'
};
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export const platformAdmin = user => user?.status === 'active' && user.roles?.some(r => ['Platform Admin', 'DURANKI_ADMIN'].includes(r));
export function tenantDirectory(state) {
  const tenants = new Map((state.importedCommunities || []).map(c => [c.tenantId, { id: c.tenantId, name: c.tenantName }]));
  for (const tenant of state.tenantAccessDirectory || []) tenants.set(tenant.id, tenant);
  return [...tenants.values()];
}
export function permissionsFor(state, user, tenantId) {
  if (!tenantDirectory(state).some(t => t.id === tenantId) || user?.status !== 'active') return [];
  if (platformAdmin(user)) return Object.keys(tenantPermissions);
  return (state.tenantStaff || []).find(a => a.userId === String(user.id) && a.tenantId === tenantId && a.status === 'active')?.permissions || [];
}
const phone = value => { const s = String(value || '').replace(/[\s()+-]/g, ''); return s.startsWith('27') ? '0' + s.slice(2) : s; };
const publicStaff = (state, row) => {
  const user = state.users.find(u => String(u.id) === row.userId);
  return { ...row, firstName: user?.firstName, lastName: user?.lastName, telephoneNumber: user?.telephoneNumber, email: user?.email };
};
export function saveTenantStaff(state, actor, tenantId, body, assignmentId, preparedPasswordHash) {
  actor = state.users.find(user => String(user.id) === String(actor?.id));
  const allowed = permissionsFor(state, actor, tenantId);
  if (!allowed.includes('users.manage')) fail(403, 'Tenant staff management permission is required.');
  const permissions = body.permissions;
  if (!Array.isArray(permissions) || !permissions.length || permissions.some(p => !Object.hasOwn(tenantPermissions, p) || !allowed.includes(p))) fail(400, 'Select only dashboard permissions you are allowed to delegate.');
  const status = body.status || 'active';
  if (!['active', 'revoked'].includes(status)) fail(400, 'Invalid access status.');
  let row = assignmentId ? (state.tenantStaff || []).find(a => a.id === assignmentId && a.tenantId === tenantId) : null;
  if (assignmentId && !row) fail(404, 'Staff assignment not found in this tenant.');
  if (row && row.userId === String(actor.id) && !platformAdmin(actor)) fail(400, 'Another tenant administrator must change your own permissions.');
  let user = row ? state.users.find(u => String(u.id) === row.userId) : null;
  if (!row) {
    const number = phone(body.telephoneNumber);
    if (!/^0\d{9}$/.test(number)) fail(400, 'Enter a valid South African telephone number.');
    const matches = state.users.filter(u => phone(u.telephoneNumber) === number);
    if (matches.length > 1) fail(409, 'Duplicate telephone records need Platform Admin review.');
    user = matches[0];
    if (user && (state.tenantStaff || []).some(a => a.tenantId === tenantId && a.userId === String(user.id))) fail(409, 'This user already has an assignment here. Edit that assignment.');
    if (user && (user.status !== 'active' || !(user.passwordHash || String(user.id) === '1000001'))) fail(409, 'This account needs Platform Admin credential review before staff access can be granted.');
    if (!user) {
      const firstName = String(body.firstName || '').trim(), lastName = String(body.lastName || '').trim(), email = String(body.email || '').trim();
      if (!firstName || !lastName || firstName.length > 100 || lastName.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a first name, surname and valid email.');
      // Only the server may supply a hash, prepared before entering the synchronous write queue.
      if (!/^scrypt-v1:[a-f0-9]{32}:[a-f0-9]{128}$/.test(preparedPasswordHash || '')) fail(409, 'Account details changed. Refresh and try again.');
      user = { id: Math.max(0, ...state.users.map(u => Number(u.id)).filter(Number.isFinite)) + 1, firstName, lastName, email, telephoneNumber: number, roles: ['Member', 'Tenant Staff'], status: 'active', passwordHash: preparedPasswordHash };
      state.users.push(user);
      state.profiles.push({ userId: user.id, telephoneNumber: number, email });
    } else if (!user.roles.includes('Tenant Staff')) user.roles.push('Tenant Staff');
    row = { id: randomUUID(), tenantId, userId: String(user.id), createdAt: new Date().toISOString() };
    (state.tenantStaff ??= []).push(row);
  }
  row.permissions = [...new Set(permissions)]; row.status = status; row.updatedAt = new Date().toISOString();
  // Keep the navigation role aligned with grants without disturbing other roles or tenants.
  if (user) {
    const hasActiveAssignment = (state.tenantStaff || []).some(a => a.userId === String(user.id) && a.status === 'active');
    if (hasActiveAssignment && !user.roles.includes('Tenant Staff')) user.roles.push('Tenant Staff');
    if (!hasActiveAssignment) user.roles = user.roles.filter(role => role !== 'Tenant Staff');
  }
  (state.tenantAccessAudit ??= []).push({ id: randomUUID(), actorId: String(actor.id), tenantId, userId: row.userId, permissions: [...row.permissions], status, at: row.updatedAt });
  return publicStaff(state, row);
}

export function createTenantAccessRouter({ requireAuth, readState, updateState, databaseAvailable = false }) {
  const router = express.Router();
  router.use(requireAuth);
  router.use((req, res, next) => {
    if (databaseAvailable) return res.status(503).json({ message: 'Tenant staff storage must be migrated before enabling this workspace with SQL authentication.' });
    req.actor = readState().users.find(u => String(u.id) === String(req.auth.sub));
    if (req.actor?.status !== 'active') return res.status(403).json({ message: 'Active account required.' });
    next();
  });
  router.get('/', (req, res) => res.json(tenantDirectory(readState()).map(t => ({ ...t, permissions: permissionsFor(readState(), req.actor, t.id) })).filter(t => t.permissions.length)));
  router.post('/', async (req, res, next) => { try {
    if (!platformAdmin(req.actor)) return res.status(403).json({ message: 'Platform Admin required.' });
    const { id, name } = req.body;
    if (typeof id !== 'string' || !/^tenant-[a-z0-9-]{1,80}$/.test(id) || typeof name !== 'string' || !name.trim() || name.length > 100) return res.status(400).json({ message: 'Valid tenant identifier and name required.' });
    const result = await updateState(state => {
      if (!platformAdmin(state.users.find(user => String(user.id) === String(req.auth.sub)))) fail(403, 'Platform Admin required.');
      const existing = tenantDirectory(state).find(t => t.id === id);
      if (existing) return { row: existing, created: false };
      const row = { id, name: name.trim() };
      (state.tenantAccessDirectory ??= []).push(row);
      return { row, created: true };
    });
    return res.status(result.created ? 201 : 200).json(result.row);
  } catch (error) { if (error.status) res.status(error.status).json({ message: error.message }); else next(error); } });
  const guard = permission => (req, res, next) => permissionsFor(readState(), req.actor, req.params.tenantId).includes(permission) ? next() : res.status(403).json({ message: 'You do not have permission for this tenant dashboard.' });
  router.get('/:tenantId/staff', guard('users.manage'), (req, res) => res.json({ permissions: tenantPermissions, staff: (readState().tenantStaff || []).filter(a => a.tenantId === req.params.tenantId).map(a => publicStaff(readState(), a)) }));
  router.get('/:tenantId/communities', guard('communities.view'), (req, res) => res.json((readState().importedCommunities || []).filter(c => c.tenantId === req.params.tenantId)));
  const save = async (req, res, next) => {
    try {
      const existing = readState().users.some(user => phone(user.telephoneNumber) === phone(req.body.telephoneNumber));
      const preparedPasswordHash = !req.params.assignmentId && !existing ? await hashPassword(req.body.password) : undefined;
      const result = await updateState(state => saveTenantStaff(state,
        state.users.find(u=>String(u.id)===String(req.auth.sub)),req.params.tenantId,req.body,req.params.assignmentId,preparedPasswordHash));
      res.json(result);
    } catch (error) { if (error.status) res.status(error.status).json({ message: error.message }); else next(error); }
  };
  router.post('/:tenantId/staff', guard('users.manage'), save);
  router.put('/:tenantId/staff/:assignmentId', guard('users.manage'), save);
  return router;
}

import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { fail, relationshipPath } from './heritage-store.js';
import {heritageScopes} from './heritage-api.js';
import { serviceStorageTenant } from './trader-community-hierarchy.js';
export function createMysqlHeritageRouter({ requireAuth, readState, resolveUser, store }) {
    if (!store) throw Error('A MariaDB heritage store is required.');
    const router = express.Router();
    router.get('/public/:id', async (req, res) => {
        const p = (await store.get("SELECT p.* FROM heritage_person p JOIN heritage_community_service c ON c.community_id=p.community_id JOIN heritage_tenant_service t ON t.tenant_id=p.tenant_id WHERE p.person_id=? AND p.privacy='Public' AND c.enabled=1 AND t.enabled=1", req.params.id));
        if (!p)
            return res.status(404).json({ message: 'Public profile not available.' });
        res.set('Cache-Control', 'no-store').json({ person_id: p.person_id, display_name: p.display_name, birth_year: p.birth_date.slice(0, 4), death_year: p.death_date.slice(0, 4), verification: p.verification });
    });
    router.use(requireAuth);
    router.use(async (req, res, next) => {
        try {
            res.set('Cache-Control', 'no-store');
            const user = await resolveUser(req.auth.sub);
            if (!user || user.status !== 'active')
                fail(403, 'Active account required.');
            const state = readState(), all = heritageScopes(state), roles = user.roles || [], id = String(user.id);
            req.actor = { id, name: `${user.first_name || user.firstName || ''} ${user.last_name || user.lastName || ''}`.trim(), platform: roles.includes('Platform Admin'), admin: roles.some(r => ['Tenant Admin', 'Community Admin', 'TENANT_ADMIN', 'COMMUNITY_ADMIN'].includes(r)), scopes: all.filter(s => (state.memberCommunities || []).some(m => String(m.memberId) === id && (m.communityId || m.churchId) === s.community_id && serviceStorageTenant(state, m.tenantId, m.communityId || m.churchId) === s.tenant_id)) };
            // Explicit grants extend verifier access only to their assigned community, never a global role alone.
            if (req.actor.admin)
                for (const s of all)
                    if ((await store.get("SELECT 1 FROM heritage_verifier WHERE user_id=? AND tenant_id=? AND community_id=?", id, s.tenant_id, s.community_id)) && !req.actor.scopes.some(x => x.community_id === s.community_id))
                        req.actor.scopes.push(s);
            req.allScopes = all;
            next();
        }
        catch (e) {
            next(e);
        }
    });
    router.get('/access', async (req, res) => res.json({ service: { service_id: 'duranki-heritage', name: 'Duranki Heritage / Family Tree', dashboard: '/dashboard/heritage', amountCents: 0, currency: 'ZAR' }, userId: req.actor.id, platform: req.actor.platform, subscriptions: (await store.subscriptions(req.actor.id)), invitations: (await store.invitations(req.actor)), scopes: await Promise.all((req.actor.platform ? req.allScopes : req.actor.scopes).map(async (s) => ({ ...s, ...((await store.get("SELECT c.enabled,t.enabled AS tenant_enabled FROM heritage_community_service c JOIN heritage_tenant_service t USING(tenant_id) WHERE c.community_id=?", s.community_id)) || { enabled: 0, tenant_enabled: 0 }) }))) }));
    router.post('/enrol', async (req, res) => res.json((await store.tx(async () => (await store.enrol(req.actor, String(req.body.community_id || '')))))));
    router.post('/invitations/:id/accept', async (req, res) => res.json((await store.acceptInvitation(req.actor, req.params.id))));
    router.post('/invitations/:id/decline', async (req, res) => { await store.tx(async()=>{const inv = (await store.get("SELECT * FROM heritage_invitation WHERE invitation_id=? AND target_user_id=? AND used_at IS NULL", req.params.id, req.actor.id)); if (!inv)
        fail(404, 'Invitation not available.'); (await store.run("UPDATE heritage_invitation SET used_at=? WHERE invitation_id=?", new Date().toISOString(), inv.invitation_id)); (await store.audit(req.actor, 'CLAIM_DECLINED', inv.person_id));}); res.json({ ok: true }); });
    router.put('/configuration', async (req, res) => res.json((await store.configure(req.actor, req.allScopes, req.body))));
    router.put('/verifiers', async (req, res) => {
        if (!req.actor.platform)
            fail(403, 'Platform administrator required.');
        const s = req.allScopes.find(s => s.community_id === req.body.community_id);
        if (!s)
            fail(400, 'Choose an existing community.');
        if (!(await store.get("SELECT 1 FROM heritage_community_service WHERE community_id=?", s.community_id)))
            fail(400, 'Configure the service first.');
        const target = await resolveUser(String(req.body.user_id));
        if (!target || target.status !== 'active' || !target.roles?.some(r => ['Tenant Admin', 'Community Admin', 'TENANT_ADMIN', 'COMMUNITY_ADMIN'].includes(r)))
            fail(400, 'Choose an existing tenant or community administrator.');
        if (typeof req.body.enabled !== 'boolean')
            fail(400, 'Choose verifier availability.');
        await store.tx(async()=>{if (req.body.enabled)
            (await store.run("INSERT IGNORE INTO heritage_verifier VALUES(?,?,?)", String(target.id), s.tenant_id, s.community_id));
        else
            (await store.run("DELETE FROM heritage_verifier WHERE user_id=? AND tenant_id=? AND community_id=?", String(target.id), s.tenant_id, s.community_id));
        (await store.audit(req.actor, 'VERIFIER_CONFIGURED', String(target.id)));
        });
        res.json({ ok: true });
    });
    router.get('/tree', async (req, res) => res.json((await store.snapshot(req.actor, String(req.query.community_id || '')))));
    router.post('/trees', async (req, res) => res.status(201).json((await store.createTree(req.actor, req.body))));
    router.post('/duplicates', async (req, res) => res.json((await store.duplicates(req.actor, req.body))));
    router.post('/people', async (req, res) => res.status(201).json((await store.tx(async () => (await store.createPerson(req.actor, req.body))))));
    router.put('/people/:id', async (req, res) => res.json((await store.updatePerson(req.actor, req.params.id, req.body))));
    router.post('/relationships', async (req, res) => res.status(201).json((await store.addRelationship(req.actor, req.body))));
    router.delete('/relationships/:id', async (req, res) => { await store.tx(async()=>{const r = (await store.get("SELECT * FROM heritage_relationship WHERE relationship_id=?", req.params.id)); if (!r)
        fail(404, 'Relationship not available.'); (await store.person(req.actor, r.from_person_id, true)); (await store.person(req.actor, r.to_person_id, true)); (await store.run("DELETE FROM heritage_relationship WHERE relationship_id=?", r.relationship_id)); (await store.run("UPDATE heritage_person SET verification='Unverified',version=version+1 WHERE person_id IN (?,?)", r.from_person_id, r.to_person_id)); (await store.audit(req.actor, 'RELATIONSHIP_REMOVED', r.relationship_id)); }); res.json({ ok: true }); });
    router.get('/path', async (req, res) => { const from = (await store.person(req.actor, String(req.query.from))), to = (await store.person(req.actor, String(req.query.to))); if (from.tree_id !== to.tree_id)
        fail(400, 'Choose people in the same tree.'); const s = (await store.snapshot(req.actor, from.community_id)); res.json(relationshipPath(s.people, s.relationships, from.person_id, to.person_id)); });
    router.post('/people/:id/invitations', async (req, res) => {
        const p = (await store.person(req.actor, req.params.id, true)), phone = String(req.body.telephoneNumber || '').replace(/\D/g, '');
        const normalized = phone.startsWith('27') && phone.length === 11 ? '0' + phone.slice(2) : phone;
        const state = readState(), targets = state.users.filter(u => u.telephoneNumber === normalized && u.status === 'active');
        if (targets.length !== 1 || !(state.memberCommunities || []).some(m => String(m.memberId) === String(targets[0].id) && m.tenantId === p.tenant_id && (m.communityId || m.churchId) === p.community_id))
            fail(400, 'The recipient must have an active account in this community.');
        res.status(201).json((await store.invite(req.actor, p.person_id, String(targets[0].id))));
    });
    router.post('/claim', async (req, res) => res.json((await store.claim(req.actor, req.body.token))));
    router.post('/people/:id/verification', async (req, res) => res.json((await store.verify(req.actor, req.params.id, req.body))));
    router.get('/people/:id/verification', async (req, res) => { (await store.person(req.actor, req.params.id)); res.json((await store.all("SELECT status,evidence,created_at FROM heritage_verification_history WHERE person_id=? ORDER BY created_at DESC", req.params.id))); });
    router.post('/leadership', async (req, res) => res.status(201).json((await store.tx(async () => (await store.royal(req.actor, req.body))))));
    router.post('/succession', async (req, res) => res.status(201).json((await store.tx(async () => (await store.succeed(req.actor, req.body))))));
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
    router.post('/people/:id/documents', async (req, res, next) => { try {
        (await store.person(req.actor, req.params.id, true));
        next();
    }
    catch (e) {
        next(e);
    } }, upload.single('document'), async (req, res) => {
        const f = req.file;
        if (!f)
            fail(400, 'Choose a PDF, PNG or JPEG document.');
        const bytes = f.buffer;
        const mime = bytes.subarray(0, 5).toString() === '%PDF-' ? 'application/pdf' : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png' : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg' : null;
        if (!mime)
            fail(400, 'Only PDF, PNG and JPEG documents are accepted.');
        const id = randomUUID();
        await store.tx(async()=>{
        await store.person(req.actor,req.params.id,true);
        (await store.run("INSERT INTO heritage_document VALUES(?,?,?,?,?,?,?)", id, req.params.id, f.originalname.replace(/[^\w. -]/g, '_').slice(0, 120), mime, bytes, req.actor.id, new Date().toISOString()));
        (await store.audit(req.actor, 'DOCUMENT_UPLOADED', id));
        });
        res.status(201).json({ document_id: id });
    });
    router.get('/documents/:id', async (req, res) => { const d = (await store.get("SELECT * FROM heritage_document WHERE document_id=?", req.params.id)); if (!d)
        fail(404, 'Document not available.'); (await store.person(req.actor, d.person_id)); res.set('Content-Disposition', 'attachment; filename="' + d.filename + '"'); res.type(d.mime).send(Buffer.from(d.content)); });
    router.use((error, req, res, next) => { if (['ER_DUP_ENTRY','ER_NO_REFERENCED_ROW_2','ER_ROW_IS_REFERENCED_2','ER_CONSTRAINT_FAILED'].includes(error.code))
        return res.status(409).json({ message: 'This record already exists or conflicts with the selected family tree.' }); if (error.code === 'LIMIT_FILE_SIZE')
        return res.status(400).json({ message: 'Documents must be 5 MB or smaller.' }); if (error.status)
        return res.status(error.status).json({ message: error.message }); next(error); });
    return router;
}

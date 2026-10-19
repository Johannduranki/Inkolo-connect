import { randomUUID, randomBytes } from 'node:crypto';
import { SERVICE_ID, fail, text, normalize, date, now, hash } from './heritage-store.js';
import { MysqlServiceStore } from './mysql-service-store.js';
export class MysqlHeritageStore extends MysqlServiceStore {
    constructor(pool) { super(pool, 'heritage'); for (const name of ["enrol", "acceptInvitation", "configure", "createTree", "createPerson", "updatePerson", "addRelationship", "invite", "claim", "verify", "royal", "succeed", "snapshot", "duplicates", "person", "invitations", "subscriptions"]) {
        const work = this[name].bind(this);
        this[name] = (...args) => this.tx(() => work(...args));
    } }
    async audit(actor, action, id) { (await this.run("INSERT INTO heritage_audit(actor,action,record_id,created_at) VALUES(?,?,?,?)", actor.id, action, id, now())); }
    async enrol(actor, community) {
        const scope = (await this.scope(actor, community));
        if ((await this.get("SELECT 1 FROM heritage_enrolment WHERE user_id=? AND community_id=? AND status='active'", actor.id, community)))
            return { ok: true };
        (await this.run("INSERT INTO heritage_enrolment VALUES(?,?,?,?,'active',?) ON DUPLICATE KEY UPDATE status='active'", actor.id, scope.tenant_id, scope.community_id, SERVICE_ID, now()));
        (await this.audit(actor, 'SERVICE_JOINED', community));
        return { ok: true };
    }
    async subscriptions(userId) {
        return (await this.all("SELECT e.*,c.name,c.enabled,t.enabled AS tenant_enabled FROM heritage_enrolment e JOIN heritage_community_service c USING(community_id) JOIN heritage_tenant_service t ON t.tenant_id=e.tenant_id WHERE e.user_id=?", String(userId))).map(e => ({ userId: String(userId), tenantId: e.tenant_id, communityId: e.community_id, communityName: e.name, serviceCode: SERVICE_ID, serviceName: 'Duranki Heritage / Family Tree', planCode: 'free', planLabel: 'Heritage - ' + e.name, amountCents: 0, currency: 'ZAR', billingCycle: 'monthly', status: e.status === 'active' && (!e.enabled || !e.tenant_enabled) ? 'suspended' : e.status, subscribedAt: e.created_at, dashboardRoute: '/dashboard/heritage?communityId=' + encodeURIComponent(e.community_id) }));
    }
    async invitations(actor) {
        return (await this.all("SELECT i.invitation_id,i.person_id,i.expires_at,p.display_name,p.community_id,p.tenant_id FROM heritage_invitation i JOIN heritage_person p USING(person_id) JOIN heritage_community_service c ON c.community_id=p.community_id JOIN heritage_tenant_service t ON t.tenant_id=p.tenant_id WHERE i.target_user_id=? AND i.used_at IS NULL AND i.expires_at>? AND c.enabled=1 AND t.enabled=1", actor.id, now())).filter(i => this.inScope(actor, i.tenant_id, i.community_id)).map(({ tenant_id, ...i }) => i);
    }
    async acceptInvitation(actor, id) {
        return (await this.tx(async () => {
            const inv = (await this.get("SELECT * FROM heritage_invitation WHERE invitation_id=? AND target_user_id=? AND used_at IS NULL AND expires_at>?", id, actor.id, now()));
            if (!inv)
                fail(404, 'Invitation is invalid or expired.');
            const p = (await this.get("SELECT * FROM heritage_person WHERE person_id=?", inv.person_id));
            (await this.scope(actor, p.community_id));
            if (p.claimed_user_id)
                fail(409, 'Already claimed.');
            (await this.run("UPDATE heritage_person SET claimed_user_id=?,owner_user_id=?,privacy='Private',verification='Unverified',version=version+1 WHERE person_id=?", actor.id, actor.id, p.person_id));
            (await this.run("UPDATE heritage_invitation SET used_at=? WHERE invitation_id=?", now(), id));
            (await this.enrol(actor, p.community_id));
            (await this.audit(actor, 'PERSON_CLAIMED', p.person_id));
            return { person_id: p.person_id };
        }));
    }
    inScope(actor, tenant, community) { return actor.platform || actor.scopes.some(s => s.tenant_id === tenant && s.community_id === community); }
    async scope(actor, community) { const s = (await this.get("SELECT c.*,t.enabled AS tenant_enabled FROM heritage_community_service c JOIN heritage_tenant_service t USING(tenant_id) WHERE c.community_id=?", community)); if (!s || !this.inScope(actor, s.tenant_id, s.community_id))
        fail(404, 'Community not available.'); if (!s.enabled || !s.tenant_enabled)
        fail(403, 'Heritage is not enabled for this tenant and community.'); return s; }
    async family(actor, tree) { return !!(await this.get("SELECT person_id FROM heritage_person WHERE tree_id=? AND claimed_user_id=?", tree, actor.id)); }
    async canRead(actor, p) { return this.inScope(actor, p.tenant_id, p.community_id) && (p.owner_user_id === actor.id || p.claimed_user_id === actor.id || ['Community', 'Public'].includes(p.privacy) || (p.privacy === 'Family' && (await this.family(actor, p.tree_id)))); }
    async person(actor, id, edit = false) { const p = (await this.get("SELECT * FROM heritage_person WHERE person_id=?", id)); if (!p)
        fail(404, 'Person not available.'); (await this.scope(actor, p.community_id)); if (!(await this.canRead(actor, p)))
        fail(404, 'Person not available.'); if (edit && (p.claimed_user_id || p.owner_user_id) !== actor.id)
        fail(403, 'Only the profile manager can edit this person.'); return p; }
    async configure(actor, scopes, body) {
        if (!actor.platform)
            fail(403, 'Platform administrator required.');
        const scope = scopes.find(s => s.community_id === body.community_id && s.tenant_id === body.tenant_id);
        if (!scope)
            fail(400, 'Choose an existing tenant/community.');
        if (typeof body.tenant_enabled !== 'boolean' || typeof body.enabled !== 'boolean')
            fail(400, 'Choose service availability.');
        return (await this.tx(async () => { (await this.run("INSERT INTO heritage_tenant_service VALUES(?,?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled)", scope.tenant_id, SERVICE_ID, +body.tenant_enabled)); (await this.run("INSERT INTO heritage_community_service VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),name=VALUES(name)", scope.community_id, scope.tenant_id, scope.name, +body.enabled)); (await this.audit(actor, 'SERVICE_CONFIGURED', scope.community_id)); return { ok: true }; }));
    }
    async snapshot(actor, community) {
        const scope = await this.scope(actor, community), people = [];
        for(const p of await this.all("SELECT * FROM heritage_person WHERE tenant_id=? AND community_id=?",scope.tenant_id,community))if(await this.canRead(actor,p))people.push(p);
        const ids = new Set(people.map(p => p.person_id)), trees = (await this.all("SELECT * FROM heritage_tree WHERE tenant_id=? AND community_id=?", scope.tenant_id, community)).filter(t => t.owner_user_id === actor.id || people.some(p => p.tree_id === t.tree_id));
        return { people: people.map(p => ({ ...p, canEdit: (p.claimed_user_id || p.owner_user_id) === actor.id })), trees,
            relationships: (await this.all("SELECT r.* FROM heritage_relationship r JOIN heritage_tree t USING(tree_id) WHERE t.community_id=?", community)).filter(r => ids.has(r.from_person_id) && ids.has(r.to_person_id)),
            leadership: (await this.all("SELECT l.* FROM heritage_leadership l JOIN heritage_tree t USING(tree_id) WHERE t.community_id=?", community)).filter(l => ids.has(l.person_id)),
            succession: (await this.all("SELECT s.* FROM heritage_succession s JOIN heritage_tree t USING(tree_id) WHERE t.community_id=?", community)).filter(s => ids.has(s.predecessor_id) && ids.has(s.successor_id)),
            documents: (await this.all("SELECT d.document_id,d.person_id,d.filename,d.created_at FROM heritage_document d JOIN heritage_person p USING(person_id) WHERE p.community_id=?", community)).filter(d => ids.has(d.person_id)),
            canVerify: actor.platform || (await this.isVerifier(actor, scope)), userId: actor.id, platform: actor.platform };
    }
    async isVerifier(actor, p) { return actor.admin && !!(await this.get("SELECT 1 FROM heritage_verifier WHERE user_id=? AND tenant_id=? AND community_id=?", actor.id, p.tenant_id, p.community_id)); }
    async createTree(actor, body) { const s = (await this.scope(actor, body.community_id)); return (await this.tx(async () => { const id = randomUUID(); (await this.run("INSERT INTO heritage_tree VALUES(?,?,?,?,?,?)", id, s.tenant_id, s.community_id, actor.id, text(body.name), now())); const person = (await this.createPerson(actor, { tree_id: id, display_name: actor.name, privacy: 'Private' }, true)); (await this.enrol(actor, s.community_id)); (await this.audit(actor, 'TREE_CREATED', id)); return { tree_id: id, person_id: person.person_id }; })); }
    async duplicates(actor, body) {
        const s=await this.scope(actor,body.community_id),matches=[];
        for(const p of await this.all("SELECT * FROM heritage_person WHERE tenant_id=? AND community_id=? AND name_key=?",s.tenant_id,s.community_id,normalize(text(body.display_name))))if(await this.canRead(actor,p))matches.push({person_id:p.person_id,tree_id:p.tree_id,display_name:p.display_name,birth_date:p.birth_date});
        return matches;
    }
    async createPerson(actor, b, self = false) {
        const tree = (await this.get("SELECT * FROM heritage_tree WHERE tree_id=?", b.tree_id));
        if (!tree)
            fail(404, 'Tree not available.');
        (await this.scope(actor, tree.community_id));
        if (tree.owner_user_id !== actor.id && !(await this.family(actor, tree.tree_id)))
            fail(403, 'Join this family tree before adding people.');
        const name = text(b.display_name), birth = date(b.birth_date), death = date(b.death_date);
        if (birth && death && death < birth)
            fail(400, 'Death cannot precede birth.');
        if (!['Private', 'Family', 'Community', 'Public'].includes(b.privacy || 'Private'))
            fail(400, 'Choose a privacy level.');
        if (b.privacy === 'Public' && !self && !death)
            fail(400, 'Living relatives must claim their profile before making it Public.');
        const matches = (await this.all("SELECT * FROM heritage_person WHERE tenant_id=? AND community_id=? AND name_key=? AND birth_date=?", tree.tenant_id, tree.community_id, normalize(name), birth));
        if (matches.length && !self && !b.duplicate_reason)
            fail(409, 'A matching person already exists. Review duplicates or supply a reason for a distinct person.');
        if (b.duplicate_reason)
            text(b.duplicate_reason, 500);
        const id = randomUUID();
        (await this.run("INSERT INTO heritage_person(person_id,tree_id,tenant_id,community_id,owner_user_id,claimed_user_id,display_name,name_key,birth_date,death_date,notes,privacy,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", id, tree.tree_id, tree.tenant_id, tree.community_id, actor.id, self ? actor.id : null, name, normalize(name), birth, death, b.notes ? text(b.notes, 2000) : '', b.privacy || 'Private', now()));
        if (b.duplicate_reason)
            (await this.run("INSERT INTO heritage_duplicate_review VALUES(?,?,?)", id, b.duplicate_reason.trim(), actor.id));
        (await this.audit(actor, b.duplicate_reason ? 'PERSON_CREATED_DUPLICATE_REVIEWED' : 'PERSON_CREATED', id));
        return { person_id: id };
    }
    async updatePerson(actor, id, b) {
        const p = (await this.person(actor, id, true));
        if (b.version !== p.version)
            fail(409, 'This person changed. Reload before saving.');
        const name = text(b.display_name), birth = date(b.birth_date), death = date(b.death_date);
        if (birth && death && death < birth)
            fail(400, 'Death cannot precede birth.');
        if (!['Private', 'Family', 'Community', 'Public'].includes(b.privacy))
            fail(400, 'Choose a privacy level.');
        if (b.privacy === 'Public' && p.claimed_user_id !== actor.id && !death)
            fail(400, 'Living relatives must claim their profile before making it Public.');
        return (await this.tx(async () => { (await this.run("UPDATE heritage_person SET display_name=?,name_key=?,birth_date=?,death_date=?,notes=?,privacy=?,verification='Unverified',version=version+1 WHERE person_id=?", name, normalize(name), birth, death, b.notes ? text(b.notes, 2000) : '', b.privacy, id)); (await this.audit(actor, 'PERSON_UPDATED_VERIFICATION_RESET', id)); return { ok: true }; }));
    }
    async addRelationship(actor, b) {
        const from = (await this.person(actor, b.from_person_id, true)), to = (await this.person(actor, b.to_person_id, true));
        if (from.tree_id !== to.tree_id || from.person_id === to.person_id)
            fail(400, 'Choose two different people in the same tree.');
        if (!['parent', 'spouse', 'sibling'].includes(b.type) || !['biological', 'adoptive', 'step', 'unspecified'].includes(b.kind))
            fail(400, 'Choose a relationship type.');
        let a = from.person_id, c = to.person_id;
        if (b.type !== 'parent' && a > c)
            [a, c] = [c, a];
        if (b.type === 'parent') {
            const edges = (await this.all("SELECT from_person_id,to_person_id FROM heritage_relationship WHERE tree_id=? AND type='parent'", from.tree_id)), seen = new Set([c]), queue = [c];
            for (let i = 0; i < queue.length; i++)
                for (const e of edges)
                    if (e.from_person_id === queue[i] && !seen.has(e.to_person_id)) {
                        seen.add(e.to_person_id);
                        queue.push(e.to_person_id);
                    }
            if (seen.has(a))
                fail(409, 'This would create an ancestry cycle.');
        }
        return (await this.tx(async () => { const id = randomUUID(); (await this.run("INSERT INTO heritage_relationship VALUES(?,?,?,?,?,?,?)", id, from.tree_id, a, c, b.type, b.kind, actor.id)); (await this.run("UPDATE heritage_person SET verification='Unverified',version=version+1 WHERE person_id IN (?,?)", a, c)); (await this.audit(actor, 'RELATIONSHIP_CREATED', id)); return { relationship_id: id }; }));
    }
    async invite(actor, id, target) { const p = (await this.person(actor, id, true)); if (p.claimed_user_id)
        fail(409, 'This profile is already claimed.'); const token = randomBytes(32).toString('hex'); return (await this.tx(async () => { (await this.run("DELETE FROM heritage_invitation WHERE person_id=? AND used_at IS NULL", id)); (await this.run("INSERT INTO heritage_invitation VALUES(?,?,?,?,?,?,?)", randomUUID(), id, target, hash(token), new Date(Date.now() + 7 * 86400000).toISOString(), null, actor.id)); (await this.audit(actor, 'CLAIM_INVITED', id)); return { token, expiresInDays: 7 }; })); }
    async claim(actor, token) { const inv = (await this.get("SELECT invitation_id FROM heritage_invitation WHERE token_hash=? AND target_user_id=? AND used_at IS NULL AND expires_at>?", hash(text(token, 100)), actor.id, now())); if (!inv)
        fail(404, 'Invitation is invalid or expired.'); return (await this.acceptInvitation(actor, inv.invitation_id)); }
    async verify(actor, id, b) { const p = (await this.person(actor, id)), status = b.status, evidence = text(b.evidence, 2000); if (!['Family Confirmed', 'Community Verified', 'Officially Verified'].includes(status))
        fail(400, 'Choose a verification status.'); if (p.owner_user_id === actor.id || p.claimed_user_id === actor.id)
        fail(403, 'Another authorised person must verify this record.'); if (status === 'Family Confirmed' && !(await this.family(actor, p.tree_id)))
        fail(403, 'A claimed family member must confirm.'); if (status === 'Community Verified' && !actor.platform && !(await this.isVerifier(actor, p)))
        fail(403, 'Scoped verifier required.'); if (status === 'Officially Verified' && !actor.platform)
        fail(403, 'Platform review of official evidence required.'); if (status === 'Officially Verified' && !(await this.get("SELECT 1 FROM heritage_document WHERE person_id=?", id)))
        fail(400, 'Upload supporting documentation first.'); return (await this.tx(async () => { (await this.run("INSERT INTO heritage_verification_history VALUES(?,?,?,?,?,?)", randomUUID(), id, status, evidence, actor.id, now())); (await this.run("UPDATE heritage_person SET verification=?,version=version+1 WHERE person_id=?", status, id)); (await this.audit(actor, 'PERSON_VERIFIED', id)); return { ok: true }; })); }
    async royal(actor, b) { const p = (await this.person(actor, b.person_id, true)); if (!['King', 'Queen', 'Chief', 'Prince', 'Princess', 'Traditional Leader'].includes(b.title))
        fail(400, 'Choose a title.'); const from = date(b.reign_from), to = date(b.reign_to); if (from && to && to < from)
        fail(400, 'Reign end precedes start.'); const id = randomUUID(); (await this.run("INSERT INTO heritage_leadership VALUES(?,?,?,?,?,?,?,?,?)", id, p.person_id, p.tree_id, b.title, text(b.royal_house), text(b.clan), from, to, b.notes ? text(b.notes, 2000) : '')); (await this.audit(actor, 'LEADERSHIP_RECORDED', id)); return { leadership_id: id }; }
    async succeed(actor, b) { const a = (await this.person(actor, b.predecessor_id, true)), c = (await this.person(actor, b.successor_id, true)); if (a.tree_id !== c.tree_id || a.person_id === c.person_id)
        fail(400, 'Choose different people in the same tree.'); const id = randomUUID(); (await this.run("INSERT INTO heritage_succession VALUES(?,?,?,?,?,?,?)", id, a.tree_id, a.person_id, c.person_id, text(b.office), date(b.effective_on), b.notes ? text(b.notes, 2000) : '')); (await this.audit(actor, 'SUCCESSION_RECORDED', id)); return { succession_id: id }; }
}

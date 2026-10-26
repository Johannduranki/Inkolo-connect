import { isolatedStore } from './isolated-stores.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { HeritageStore, relationshipPath } from '../src/heritage-store.js';
const scope = { tenant_id: 'tenant-a', community_id: 'community-a', name: 'Community A' };
const admin = { id: 'admin', name: 'Admin', platform: true, scopes: [] };
const member = { id: 'member', name: 'Example Member', platform: false, scopes: [scope] };
async function fixture(t) {
    const s = await isolatedStore(t, HeritageStore, 'heritage');
    await s.configure(admin, [scope], { ...scope, tenant_enabled: true, enabled: true });
    const tree = await s.createTree(member, { community_id: scope.community_id, name: 'Example family' });
    const add = async (name, privacy = 'Family') => (await s.createPerson(member, { tree_id: tree.tree_id, display_name: name, privacy })).person_id;
    const link = async (a, b, type = 'parent') => await s.addRelationship(member, { from_person_id: a, to_person_id: b, type, kind: 'biological' });
    return { s, tree, add, link };
}
test('enrolment is scoped, idempotent and suspended when disabled', async (t) => {
    const { s } = await fixture(t);
    await s.enrol(member, scope.community_id);
    await s.enrol(member, scope.community_id);
    assert.equal((await s.subscriptions(member.id)).length, 1);
    assert.equal((await s.subscriptions(member.id))[0].amountCents, 0);
    assert.equal((await s.subscriptions('someone-else')).length, 0);
    await assert.rejects(async () => await s.enrol({ id: 'outsider', scopes: [] }, scope.community_id), { status: 404 });
    await s.configure(admin, [scope], { ...scope, tenant_enabled: true, enabled: false });
    assert.equal((await s.subscriptions(member.id))[0].status, 'suspended');
    await assert.rejects(async () => await s.enrol(member, scope.community_id), { status: 403 });
});
test('invitation inbox is recipient-only and accepting creates subscription', async (t) => {
    const { s, add } = await fixture(t), person = await add('Inbox relative');
    await s.invite(member, person, 'relative');
    const relative = { id: 'relative', scopes: [scope] }, other = { id: 'other', scopes: [scope] };
    assert.equal((await s.invitations(other)).length, 0);
    const invitation = (await s.invitations(relative))[0];
    assert.equal(invitation.display_name, 'Inbox relative');
    await assert.rejects(async () => await s.acceptInvitation(other, invitation.invitation_id), { status: 404 });
    await s.acceptInvitation(relative, invitation.invitation_id);
    assert.equal((await s.invitations(relative)).length, 0);
    assert.equal((await s.subscriptions(relative.id))[0].status, 'active');
    assert.equal((await s.person(relative, person, true)).privacy, 'Private');
    await assert.rejects(async () => await s.acceptInvitation(relative, invitation.invitation_id), { status: 404 });
});
test('tenant isolation, private and family permissions fail closed', async (t) => {
    const { s, tree, add } = await fixture(t), p = await add('Relative');
    const stranger = { id: 'stranger', scopes: [scope] };
    await assert.rejects(async () => await s.person(stranger, p), { status: 404 });
    await assert.rejects(async () => await s.person(admin, tree.person_id), { status: 404 });
    await assert.rejects(async () => await s.snapshot({ id: 'outsider', scopes: [] }, scope.community_id), { status: 404 });
    await assert.rejects(async () => await s.createPerson(stranger, { tree_id: tree.tree_id, display_name: 'Injection' }), { status: 403 });
});
test('duplicates require review, foreign tree edges rejected, cycles rejected', async (t) => {
    const { s, tree, add, link } = await fixture(t), a = await add('Parent'), b = await add('Grandparent');
    await assert.rejects(async () => await add('Parent'), { status: 409 });
    await link(b, a);
    await link(a, tree.person_id);
    await assert.rejects(async () => await link(tree.person_id, b), { status: 409 });
    const other = await s.createTree(member, { community_id: scope.community_id, name: 'Other family' });
    await assert.rejects(async () => await link(a, other.person_id), { status: 400 });
    await assert.rejects(async () => await s.run('INSERT INTO heritage_relationship VALUES(?,?,?,?,?,?,?)', 'invalid', tree.tree_id, a, other.person_id, 'parent', 'unspecified', member.id));
});
test('grandparents, cousins, descendants and hidden paths', async (t) => {
    const { s, tree, add, link } = await fixture(t), parent = await add('Parent'), grandparent = await add('Grandparent'), aunt = await add('Aunt'), cousin = await add('Cousin');
    await link(grandparent, parent);
    await link(parent, tree.person_id);
    await link(grandparent, aunt);
    await link(aunt, cousin);
    const data = await s.snapshot(member, scope.community_id), path = (a, b) => relationshipPath(data.people, data.relationships, a, b);
    assert.equal(path(tree.person_id, grandparent).label, 'Grandparent');
    assert.equal(path(tree.person_id, cousin).label, 'First cousin');
    assert.equal(path(grandparent, tree.person_id).label, 'Grandchild');
    assert.throws(() => relationshipPath([], data.relationships, tree.person_id, cousin), { status: 404 });
});
test('claim tokens are account-bound, single-use and remove creator edit access', async (t) => {
    const { s, add } = await fixture(t), p = await add('Invited relative'), inv = await s.invite(member, p, 'relative'), relative = { id: 'relative', scopes: [scope] };
    await assert.rejects(async () => await s.claim({ id: 'wrong', scopes: [scope] }, inv.token), { status: 404 });
    await s.claim(relative, inv.token);
    assert.equal((await s.person(relative, p, true)).privacy, 'Private');
    await assert.rejects(async () => await s.person(member, p, true), { status: 404 });
    await assert.rejects(async () => await s.claim(relative, inv.token), { status: 404 });
});
test('verification requires independent scoped authority and edits reset status', async (t) => {
    const { s, add } = await fixture(t), p = await add('Verified relative', 'Community'), verifier = { id: 'verifier', admin: true, scopes: [scope] };
    await assert.rejects(async () => await s.verify(member, p, { status: 'Family Confirmed', evidence: 'Self' }), { status: 403 });
    await assert.rejects(async () => await s.verify(verifier, p, { status: 'Community Verified', evidence: 'Reference' }), { status: 403 });
    await s.run('INSERT INTO heritage_verifier VALUES(?,?,?)', verifier.id, scope.tenant_id, scope.community_id);
    await s.verify(verifier, p, { status: 'Community Verified', evidence: 'Community register reference' });
    let person = await s.person(member, p);
    assert.equal(person.verification, 'Community Verified');
    await s.updatePerson(member, p, { ...person, display_name: 'Updated relative' });
    assert.equal((await s.person(member, p)).verification, 'Unverified');
    await assert.rejects(async () => await s.verify(admin, p, { status: 'Officially Verified', evidence: 'Reference' }), { status: 400 });
});
test('succession is separate from genealogy and service revocation is immediate', async (t) => {
    const { s, add } = await fixture(t), a = await add('Leader'), b = await add('Successor');
    await s.royal(member, { person_id: a, title: 'Chief', royal_house: 'Example house', clan: 'Example clan' });
    await s.succeed(member, { predecessor_id: a, successor_id: b, office: 'Chief' });
    assert.equal((await s.snapshot(member, scope.community_id)).relationships.length, 0);
    assert.equal((await s.snapshot(member, scope.community_id)).succession.length, 1);
    await s.configure(admin, [scope], { ...scope, tenant_enabled: false, enabled: true });
    await assert.rejects(async () => await s.person(member, a), { status: 403 });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { seedStudyDrafts, saveStudy, publishStudy, studyView, studyReport, saveStudyProgress, attemptStudy, createStudyRouter, validateStudy, ensureStudyDrafts, assignStudyTrainer } from '../src/study-modules.js';
import { legacyStudyCurriculum } from '../src/study-curriculum.js';

export function fixture() {
  return {
    users: [{ id: 'admin', status: 'active', roles: ['Platform Admin'] }, { id: 'trainer', firstName: 'Test', lastName: 'Trainer', status: 'active', roles: ['Tenant Staff'] }, { id: 'learner', firstName: 'Sample', lastName: 'Trader', status: 'active', roles: ['Member'] }, { id: 'other', status: 'active', roles: ['Member'] }],
    importedCommunities: [{ id: 'c-a', tenantId: 'tenant-trader-connect', tenantName: 'Trader Connect' }, { id: 'c-b', tenantId: 'tenant-other', tenantName: 'Other tenant' }],
    tenantStaff: [{ userId: 'trainer', tenantId: 'tenant-trader-connect', status: 'active', permissions: ['training.manage'] }],
    memberCommunities: [{ memberId: 'learner', tenantId: 'tenant-trader-connect', communityId: 'c-a' }, { memberId: 'other', tenantId: 'tenant-other', communityId: 'c-b' }]
  };
}
const tenant = 'tenant-trader-connect';
const answers = m => Object.fromEntries(m.published.questions.map(q => [q.id, q.correctIndex]));
const published = s => { const m = seedStudyDrafts(s)[0]; return publishStudy(s, 'trainer', tenant, m.id, { revision: m.revision }); };
const completeLessons = (s, m) => saveStudyProgress(s, 'learner', tenant, m.id, { version: m.publishedVersion, section: 'lesson', lessonId: m.published.lessons[2].id, completedLessons: m.published.lessons.map(l => l.id), answers: {}, videoTimes: {} });

test('Module 7 appends safely, requires all five lessons and passes at 80% without purchasing a product', () => {
  const s = fixture(); seedStudyDrafts(s); s.trainingStudyModules.pop();
  s.trainingStudyModules[0].draft.content = 'Administrator review in progress.';
  const original = structuredClone(s.trainingStudyModules), added = seedStudyDrafts(s);
  assert.equal(added.length, 1); assert.deepEqual(s.trainingStudyModules.slice(0, 6), original);
  const m = added[0]; assert.equal(m.order, 7); assert.equal(m.published, null); assert.equal(m.draft.resources.length, 0);
  assert(m.draft.lessons.every(l => l.content.includes('Practical activity:')));
  publishStudy(s, 'trainer', tenant, m.id, { revision: m.revision });
  const progress = { version: 1, section: 'quiz', lessonId: 'lesson-5', completedLessons: m.published.lessons.slice(0, 4).map(l => l.id), answers: {}, videoTimes: {} };
  saveStudyProgress(s, 'learner', tenant, m.id, progress);
  assert.throws(() => attemptStudy(s, 'learner', tenant, m.id, { version: 1, answers: answers(m) }), { status: 400 });
  saveStudyProgress(s, 'learner', tenant, m.id, { ...progress, completedLessons: m.published.lessons.map(l => l.id) });
  const responses = answers(m); responses.q1 = (responses.q1 + 1) % 3;
  const result = attemptStudy(s, 'learner', tenant, m.id, { version: 1, answers: responses });
  assert.equal(result.score, 80); assert(result.passed); assert.equal(result.feedback.length, 5);
  assert.equal(s.walletTransactions, undefined); assert.equal(s.serviceSubscriptions, undefined); assert.equal(s.entitlements, undefined);
  assert.equal(seedStudyDrafts(s).length, 0);
});

test('seven reviewed study titles are seeded once and remain unpublished', async () => {
  const s = fixture(); assert.equal(seedStudyDrafts(s).length, 7); assert.equal(seedStudyDrafts(s).length, 0);
  assert.deepEqual(s.trainingStudyModules.map(m => m.draft.title), ['Getting Started with Duranki', 'Financial Literacy and Business Records', 'Pricing, Costs and Profit', 'Stock Control and Bulk Buying', 'Customer Service and Marketing', 'Business Growth and Sustainability', 'Banking, Saving and Planning for the Future']);
  assert(s.trainingStudyModules.every((m, i) => !m.published && m.draft.content.length > 40 && m.draft.questions.length === 5 && m.draft.lessons.length === (i === 6 ? 5 : 3) && m.draft.passPercentage === 80 && m.draft.questions.every(q => q.explanation)));
  assert.equal(studyView(s, 'learner', tenant).modules.length, 0);
  let writes = 0; await ensureStudyDrafts({ readState: () => s, updateState: fn => { writes++; return fn(s); } }); assert.equal(writes, 0);
});
test('tenant-scoped teaching permission does not become platform or other tenant access', () => {
  const s = fixture(), m = published(s);
  assert.throws(() => studyView(s, 'other', tenant), { status: 403 });
  assert.throws(() => saveStudy(s, 'trainer', 'tenant-other', null, m.draft), { status: 403 });
  assert.throws(() => publishStudy(s, 'learner', tenant, m.id, { revision: m.revision }), { status: 403 });
  assert.throws(() => studyReport(s, 'learner', tenant), { status: 403 });
  s.tenantStaff[0].status = 'revoked'; assert.throws(() => studyReport(s, 'trainer', tenant), { status: 403 });
});
test('learner payload omits drafts and answer keys, including after resuming', () => {
  const s = fixture(), m = published(s), result = studyView(s, 'learner', tenant);
  assert.equal(result.modules.length, 1); assert(!JSON.stringify(result).includes('correctIndex')); assert(!JSON.stringify(result).includes('draft'));
  saveStudyProgress(s, 'learner', tenant, m.id, { version: 1, section: 'quiz', answers: { q1: 0 }, videoTimes: {} });
  const view = studyView(s, 'learner', tenant); assert.equal(view.progress[0].section, 'quiz'); assert.equal(view.progress[0].answers.q1, 0);
  assert(!JSON.stringify(view).includes('correctIndex'));
});
test('video positions and quiz choices survive serialized storage and are tenant-bound', () => {
  let s = fixture(), m = seedStudyDrafts(s)[0];
  m = saveStudy(s, 'trainer', tenant, m.id, { ...m.draft, revision: m.revision, resources: [{ kind: 'video', title: 'Sample', url: 'https://example.test/video.mp4' }, { kind: 'document', title: 'Worksheet', url: 'https://example.test/sheet.pdf' }] });
  m = publishStudy(s, 'trainer', tenant, m.id, { revision: m.revision });
  saveStudyProgress(s, 'learner', tenant, m.id, { version: 1, section: 'resources', answers: { q1: 0 }, videoTimes: { 'resource-1': 42 } });
  s = JSON.parse(JSON.stringify(s)); assert.equal(studyView(s, 'learner', tenant).progress[0].videoTimes['resource-1'], 42);
  assert.throws(() => saveStudyProgress(s, 'other', 'tenant-other', m.id, { version: 1, section: 'quiz', answers: {}, videoTimes: {} }), { status: 404 });
});
test('all lessons required, 60% fails, 80% completes exactly once without grant writes', () => {
  const s = fixture(), m = published(s), wrong = answers(m); wrong.q1 = (wrong.q1 + 1) % 3;
  wrong.q2 = (wrong.q2 + 1) % 3;
  assert.throws(() => attemptStudy(s, 'learner', tenant, m.id, { version: 1, answers: answers(m) }), { status: 400 });
  completeLessons(s, m);
  assert.equal(attemptStudy(s, 'learner', tenant, m.id, { version: 1, answers: wrong }).passed, false);
  assert.equal(s.trainingStudyProgress[0].completedAt, null);
  wrong.q2 = answers(m).q2;
  const pass = attemptStudy(s, 'learner', tenant, m.id, { version: 1, answers: wrong }); assert.equal(pass.score, 80); assert(pass.progress.completedAt); assert.equal(pass.feedback.length, 5);
  const repeated = attemptStudy(s, 'learner', tenant, m.id, { version: 1, answers: answers(m) }); assert(repeated.alreadyCompleted); assert.equal(repeated.score, 80);
  assert.equal(s.trainingStudyAttempts.length, 2); assert.equal(s.entitlements, undefined); assert.equal(s.walletTransactions, undefined);
  const report = studyReport(s, 'trainer', tenant); assert.equal(report.attempts.length, 2); assert.equal(report.members.length, 1);
});
test('draft changes leave live lesson intact; publishing new version preserves historical completion', () => {
  const s = fixture(), m = published(s); completeLessons(s, m); attemptStudy(s, 'learner', tenant, m.id, { version: 1, answers: answers(m) });
  const old = m.published.content; saveStudy(s, 'trainer', tenant, m.id, { ...m.draft, content: 'Revised learning material.', revision: m.revision });
  assert.equal(studyView(s, 'learner', tenant).modules[0].published.content, old);
  publishStudy(s, 'trainer', tenant, m.id, { revision: m.revision }); assert.equal(m.publishedVersion, 2);
  assert.throws(() => attemptStudy(s, 'learner', tenant, m.id, { version: 1, answers: answers(m) }), { status: 409 });
  assert.equal(studyReport(s, 'trainer', tenant).attempts[0].version, 1); assert(s.trainingStudyProgress[0].completedAt);
});
test('invalid links, empty quizzes, stale updates and invented answers fail closed', () => {
  const s = fixture(), m = seedStudyDrafts(s)[0];
  for (const url of ['javascript:alert(1)', 'http://example.test/a', 'https://user:password@example.test/a']) assert.throws(() => validateStudy({ ...m.draft, resources: [{ kind: 'video', title: 'Bad', url }] }), { status: 400 });
  assert.throws(() => saveStudy(s, 'trainer', tenant, m.id, { ...m.draft, revision: 0 }), { status: 409 });
  const empty = saveStudy(s, 'trainer', tenant, null, { ...m.draft, questions: [] }); assert.throws(() => publishStudy(s, 'trainer', tenant, empty.id, { revision: 1 }), { status: 400 });
  publishStudy(s, 'trainer', tenant, m.id, { revision: 1 });
  for (const a of [{}, { q1: 999, q2: 0 }, { ...answers(m), q9: 0 }]) assert.throws(() => attemptStudy(s, 'learner', tenant, m.id, { version: 1, answers: a }), { status: 400 });
  s.memberCommunities[0].status = 'pending'; assert.throws(() => attemptStudy(s, 'learner', tenant, m.id, { version: 1, answers: answers(m) }), { status: 403 });
});
test('HTTP flow: draft -> order -> publish -> save -> retry -> complete -> tenant report; data survives reload', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'duranki-study-')), file = path.join(dir, 'state.json'); t.after(() => rmSync(dir, { recursive: true, force: true }));
  let state = fixture(); seedStudyDrafts(state); seedStudyDrafts(state, 'tenant-other');
  const app = express(); app.use(express.json());
  app.use('/study', createStudyRouter({ requireAuth: (req, res, next) => { if (!req.get('x-test-user')) return res.sendStatus(401); req.auth = { sub: req.get('x-test-user') }; next(); }, readState: () => state, updateState: fn => { const draft = structuredClone(state); const result = fn(draft); writeFileSync(file, JSON.stringify(draft)); state = JSON.parse(readFileSync(file)); return result; } }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/study`;
  const req = (route, actor, body, method) => fetch(base + route, { method: method || (body === undefined ? 'GET' : 'POST'), headers: { ...(actor ? { 'x-test-user': actor } : {}), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  assert.equal((await req('/access')).status, 401); assert.equal((await req('/tenant-other', 'trainer')).status, 403);
  let modules = (await (await req('/' + tenant, 'trainer')).json()).modules;
  assert.equal((await (await req('/' + tenant, 'learner')).json()).modules.length, 0);
  assert.equal((await req('/' + tenant + '/order', 'trainer', { modules: [...modules].reverse().map(({ id, revision }) => ({ id, revision })) }, 'PUT')).status, 200);
  modules = (await (await req('/' + tenant, 'trainer')).json()).modules; const m = modules[0];
  assert.equal((await req('/' + tenant + '/modules/' + m.id + '/publish', 'trainer', { revision: m.revision })).status, 200);
  const route = '/' + tenant + '/modules/' + m.id;
  assert.equal((await req(route + '/progress', 'learner', { version: 1, section: 'quiz', lessonId: m.draft.lessons[2].id, completedLessons: m.draft.lessons.map(l => l.id), answers: { q1: 0 }, videoTimes: {} }, 'PUT')).status, 200);
  state = JSON.parse(readFileSync(file)); assert.equal((await (await req('/' + tenant, 'learner')).json()).progress[0].section, 'quiz');
  const expected = Object.fromEntries(m.draft.questions.map(q => [q.id, q.correctIndex]));
  const completion = await (await req(route + '/attempts', 'learner', { version: 1, answers: expected })).json(); assert.equal(completion.score, 100);
  assert.equal((await req('/' + tenant + '/report', 'other')).status, 403);
  const report = await (await req('/' + tenant + '/report', 'trainer')).json(); assert.equal(report.attempts.length, 1); assert.equal(report.progress[0].userId, 'learner');
  assert.equal((await (await req('/tenant-other/report', 'admin')).json()).attempts.length, 0);
  assert.equal((await req('/tenant-other/modules/' + m.id, 'admin', { ...m.draft, revision: m.revision }, 'PUT')).status, 404);
});

test('upgrade only untouched unpublished starters; preserve IDs, edits and published material', async () => {
  const s = fixture(); seedStudyDrafts(s);
  for (const [i, m] of s.trainingStudyModules.slice(0, 6).entries()) m.draft = { ...structuredClone(legacyStudyCurriculum[i]), resources: [], questions: legacyStudyCurriculum[i].questions.map((q, n) => ({ id: 'q' + (n + 1), ...q })) };
  const ids = s.trainingStudyModules.map(m => m.id); s.trainingStudyModules[1].draft.content = 'Trainer edited this draft.';
  s.trainingStudyModules[2].published = structuredClone(s.trainingStudyModules[2].draft); s.trainingStudyModules[2].publishedVersion = 1;
  await ensureStudyDrafts({ readState: () => s, updateState: fn => fn(s) });
  assert.deepEqual(s.trainingStudyModules.map(m => m.id), ids); assert.equal(s.trainingStudyModules[0].draft.lessons.length, 3);
  assert.equal(s.trainingStudyModules[1].draft.content, 'Trainer edited this draft.'); assert.equal(s.trainingStudyModules[2].publishedVersion, 1);
  assert.equal(seedStudyDrafts(s).length, 0);
});

test('lesson positions, explained attempts, trainer assignments and detailed report remain scoped', () => {
  const s = fixture(), m = published(s);
  assert(!JSON.stringify(studyView(s, 'learner', tenant)).includes('Explanation'));
  assert.equal(studyView(s, 'learner', tenant).modules[0].published.questions[0].explanation, undefined);
  assert.throws(() => saveStudyProgress(s, 'learner', tenant, m.id, { version: 1, section: 'lesson', lessonId: 'foreign', completedLessons: [], answers: {}, videoTimes: {} }), { status: 400 });
  assert.throws(() => assignStudyTrainer(s, 'learner', tenant, 'learner', 'trainer'), { status: 403 });
  assert.throws(() => assignStudyTrainer(s, 'trainer', tenant, 'other', 'trainer'), { status: 404 });
  assert.throws(() => assignStudyTrainer(s, 'trainer', tenant, 'learner', 'other'), { status: 400 });
  assignStudyTrainer(s, 'trainer', tenant, 'learner', 'trainer');
  assert.equal(studyReport(s, 'trainer', tenant).rows[0].status, 'Not started');
  completeLessons(s, m); assert.equal(studyReport(s, 'trainer', tenant).rows[0].status, 'In progress');
  attemptStudy(s, 'learner', tenant, m.id, { version: 1, answers: answers(m) });
  const row = studyReport(s, 'trainer', tenant).rows[0]; assert.equal(row.trainer, 'Test Trainer'); assert.equal(row.status, 'Completed'); assert.equal(row.lessonsCompleted, 3); assert(row.completedAt && row.lastActivityAt); assert.equal(row.attempts, 1);
  assert.equal(studyView(s, 'learner', tenant).attempts[0].feedback.length, 5);
  assert.equal(studyReport(s, 'admin', 'tenant-other').rows.length, 0);
});

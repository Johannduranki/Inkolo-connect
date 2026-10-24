import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { permissionsFor, tenantDirectory } from './tenant-access.js';
import { studyCurriculum, legacyStudyCurriculum } from './study-curriculum.js';

const fail = (status, message) => { throw Object.assign(Error(message), { status }); };
const list = (s, key) => s[key] || [];
const user = (s, id) => s.users?.find(u => String(u.id) === String(id) && u.status === 'active');
const isMember = (s, id, tenant) => list(s, 'memberCommunities').some(m => String(m.memberId) === String(id) && m.tenantId === tenant && (!m.status || ['active', 'approved'].includes(String(m.status).toLowerCase())));
export const canTeach = (s, actor, tenant) => {
  const permissions = permissionsFor(s, actor, tenant);
  return permissions.includes('training.manage') || permissions.includes('users.manage');
};
function authorize(s, id, tenant, manage = false) {
  const actor = user(s, id);
  if (!actor || !tenantDirectory(s).some(t => t.id === tenant)) fail(403, 'Active tenant access required.');
  if (!(manage ? canTeach(s, actor, tenant) : canTeach(s, actor, tenant) || isMember(s, id, tenant))) fail(403, 'You do not have access to this tenant training.');
  return actor;
}
function audit(s, id, tenant, action, moduleId) {
  (s.trainingStudyAudit ??= []).push({ id: randomUUID(), actorId: String(id), tenantId: tenant, action, moduleId, at: new Date().toISOString() });
}
function url(value) {
  if (typeof value !== 'string' || value.length > 2000) fail(400, 'Enter a valid HTTPS resource URL.');
  let parsed; try { parsed = new URL(value); } catch { fail(400, 'Enter a valid HTTPS resource URL.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) fail(400, 'Study resources must use HTTPS without embedded credentials.');
  return parsed.href;
}
function text(value, max, name) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(400, `Enter valid ${name}.`);
  return value.trim();
}
export function validateStudy(input) {
  if (!input || typeof input !== 'object') fail(400, 'Module details required.');
  if (!Array.isArray(input.resources) || input.resources.length > 20 || !Array.isArray(input.questions) || input.questions.length > 20) fail(400, 'Use up to 20 resources and 20 questions.');
  const lessons = input.lessons ?? [{ title: 'Study material', content: input.content }];
  if (!Array.isArray(lessons) || !lessons.length || lessons.length > 30) fail(400, 'Use one to thirty lessons.');
  return {
    title: text(input.title, 150, 'module title'), content: text(input.content, 50000, 'study content'),
    course: 'Trader Business Foundations', passPercentage: 80,
    lessons: lessons.map((lesson, i) => ({ id: 'lesson-' + (i + 1), title: text(lesson?.title, 150, 'lesson title'), content: text(lesson?.content, 50000, 'lesson content') })),
    activity: input.activity ? text(input.activity, 5000, 'practical activity') : '',
    resources: input.resources.map((r, i) => {
      if (!r || !['video', 'document'].includes(r.kind)) fail(400, 'Choose video or document.');
      return { id: 'resource-' + (i + 1), kind: r.kind, title: text(r.title, 150, 'resource title'), url: url(r.url) };
    }),
    questions: input.questions.map((q, i) => {
      if (!q || !Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) fail(400, 'Each quiz question needs two to six answers.');
      const options = q.options.map(o => text(o, 500, 'answer'));
      if (new Set(options).size !== options.length || !Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= options.length) fail(400, 'Choose one correct answer and distinct options.');
      return { id: 'q' + (i + 1), prompt: text(q.prompt, 2000, 'question'), options, correctIndex: q.correctIndex, explanation: q.explanation ? text(q.explanation, 3000, 'answer explanation') : '' };
    })
  };
}
function untouchedStarter(m, index) {
  const old = legacyStudyCurriculum[index];
  return old && m && !m.published && !m.draft.lessons && m.draft.title === old.title && m.draft.content === old.content && !m.draft.resources.length && JSON.stringify(m.draft.questions.map(({ id, ...q }) => q)) === JSON.stringify(old.questions);
}
export function seedStudyDrafts(s, tenant = 'tenant-trader-connect', actor = 'system') {
  if (!tenantDirectory(s).some(t => t.id === tenant)) return [];
  const modules = s.trainingStudyModules ??= [];
  const added = [];
  studyCurriculum.forEach((lesson, index) => {
    const seedKey = 'duranki-study-v1-' + index;
    const existing = modules.find(m => m.tenantId === tenant && m.seedKey === seedKey);
    if (existing) {
      if (untouchedStarter(existing, index)) {
        existing.draft = validateStudy(lesson); existing.revision++; existing.updatedAt = new Date().toISOString();
        audit(s, actor, tenant, 'FOUNDATIONS_DRAFT_UPDATED', existing.id); added.push(existing);
      }
      return;
    }
    const m = { id: randomUUID(), tenantId: tenant, seedKey, order: modules.filter(m => m.tenantId === tenant).length + 1, revision: 1, publishedVersion: 0, draft: validateStudy({ ...lesson, resources: [] }), published: null, updatedAt: new Date().toISOString() };
    modules.push(m); added.push(m); audit(s, actor, tenant, 'DRAFT_CREATED', m.id);
  });
  return added;
}
export async function ensureStudyDrafts({ readState, updateState }) {
  const s = readState(), tenant = 'tenant-trader-connect';
  if (!tenantDirectory(s).some(t => t.id === tenant)) return;
  if (studyCurriculum.every((_, i) => { const m = list(s, 'trainingStudyModules').find(m => m.tenantId === tenant && m.seedKey === 'duranki-study-v1-' + i); return m && !untouchedStarter(m, i); })) return;
  await updateState(state => { seedStudyDrafts(state); });
}
function moduleFor(s, tenant, id) {
  const m = list(s, 'trainingStudyModules').find(m => m.tenantId === tenant && m.id === id);
  if (!m) fail(404, 'Study module not found in this tenant.');
  return m;
}
function revision(m, value) { if (value !== m.revision) fail(409, 'Module changed. Reload before saving.'); }
export function saveStudy(s, id, tenant, moduleId, input) {
  authorize(s, id, tenant, true);
  const draft = validateStudy(input);
  let m;
  if (moduleId) { m = moduleFor(s, tenant, moduleId); revision(m, input.revision); m.draft = draft; m.revision++; }
  else { m = { id: randomUUID(), tenantId: tenant, revision: 1, order: list(s, 'trainingStudyModules').filter(m => m.tenantId === tenant).length + 1, publishedVersion: 0, published: null, draft }; (s.trainingStudyModules ??= []).push(m); }
  m.updatedAt = new Date().toISOString(); audit(s, id, tenant, 'DRAFT_SAVED', m.id); return m;
}
export function publishStudy(s, id, tenant, moduleId, input) {
  authorize(s, id, tenant, true); const m = moduleFor(s, tenant, moduleId); revision(m, input?.revision);
  if (m.draft.questions.length !== 5 || m.draft.questions.some(q => !q.explanation)) fail(400, 'Add five quiz questions with explanations before publishing.');
  if (m.published && JSON.stringify(m.draft) === JSON.stringify(m.published)) fail(409, 'There are no unpublished changes.');
  m.published = structuredClone(m.draft); m.publishedVersion++; m.revision++; m.publishedAt = new Date().toISOString();
  audit(s, id, tenant, 'MODULE_PUBLISHED', m.id); return m;
}
function learnerModule(s, id, tenant, moduleId, version) {
  authorize(s, id, tenant);
  if (!isMember(s, id, tenant)) fail(403, 'Tenant community membership is required to record learning.');
  const m = moduleFor(s, tenant, moduleId);
  if (!m.published) fail(404, 'Module is not published.');
  if (m.publishedVersion !== version) fail(409, 'A new lesson version is available. Reload this module.');
  return m;
}
function answersFor(m, answers, complete = false) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) fail(400, 'Invalid quiz answers.');
  const qs = m.published.questions;
  if (Object.keys(answers).some(id => !qs.some(q => q.id === id)) || qs.some(q => Object.hasOwn(answers, q.id) && (!Number.isInteger(answers[q.id]) || answers[q.id] < 0 || answers[q.id] >= q.options.length)) || (complete && Object.keys(answers).length !== qs.length)) fail(400, 'Answer each question with a valid option.');
  return structuredClone(answers);
}
function progressFor(s, id, m) {
  const rows = s.trainingStudyProgress ??= [];
  let p = rows.find(p => p.tenantId === m.tenantId && p.moduleId === m.id && p.version === m.publishedVersion && p.userId === String(id));
  if (!p) { p = { tenantId: m.tenantId, moduleId: m.id, version: m.publishedVersion, moduleTitle: m.published.title, lessonCount: m.published.lessons?.length || 0, userId: String(id), section: 'lesson', lessonId: m.published.lessons?.[0]?.id || null, completedLessons: [], answers: {}, videoTimes: {}, completedAt: null, startedAt: new Date().toISOString() }; rows.push(p); }
  return p;
}
export function saveStudyProgress(s, id, tenant, moduleId, input) {
  const m = learnerModule(s, id, tenant, moduleId, input?.version);
  if (!['lesson', 'resources', 'quiz'].includes(input.section)) fail(400, 'Invalid lesson section.');
  const answers = answersFor(m, input.answers);
  const times = input.videoTimes;
  if (!times || typeof times !== 'object' || Array.isArray(times) || Object.entries(times).some(([key, time]) => !m.published.resources.some(r => r.id === key && r.kind === 'video') || !Number.isFinite(time) || time < 0 || time > 86400)) fail(400, 'Invalid video position.');
  const lessons = m.published.lessons || [], completed = input.completedLessons ?? [];
  if (!Array.isArray(completed) || new Set(completed).size !== completed.length || completed.some(id => !lessons.some(l => l.id === id))) fail(400, 'Invalid lesson completion.');
  if (input.lessonId && !lessons.some(l => l.id === input.lessonId)) fail(400, 'Invalid lesson position.');
  const p = progressFor(s, id, m);
  if (!p.completedAt) p.completedLessons = [...completed];
  p.lessonId = input.lessonId || p.lessonId; p.section = input.section; p.answers = answers; p.videoTimes = structuredClone(times); p.updatedAt = new Date().toISOString(); return p;
}
export function attemptStudy(s, id, tenant, moduleId, input) {
  const m = learnerModule(s, id, tenant, moduleId, input?.version), answers = answersFor(m, input.answers, true);
  const p = progressFor(s, id, m);
  const last = list(s, 'trainingStudyAttempts').filter(a => a.tenantId === tenant && a.userId === String(id) && a.moduleId === moduleId && a.version === m.publishedVersion).at(-1);
  if (p.completedAt) return { alreadyCompleted: true, passed: true, score: p.lastScore ?? 100, progress: p, feedback: last?.feedback || [] };
  if ((m.published.lessons || []).some(l => !p.completedLessons?.includes(l.id))) fail(400, 'Mark every lesson complete before submitting the quiz.');
  const correct = m.published.questions.filter(q => answers[q.id] === q.correctIndex).length;
  const score = Math.floor(correct / m.published.questions.length * 100), passed = score >= (m.published.passPercentage ?? 100), at = new Date().toISOString();
  const feedback = m.published.questions.map(q => ({ questionId: q.id, prompt: q.prompt, selectedAnswer: q.options[answers[q.id]], correctAnswer: q.options[q.correctIndex], correct: answers[q.id] === q.correctIndex, explanation: q.explanation || '' }));
  const attempt = { id: randomUUID(), tenantId: tenant, moduleId, userId: String(id), version: m.publishedVersion, moduleTitle: m.published.title, answers, score, passed, at, feedback, lessonCount: m.published.lessons?.length || 0, completedLessons: [...(p.completedLessons || [])] };
  (s.trainingStudyAttempts ??= []).push(attempt);
  p.answers = answers; p.section = 'quiz'; p.updatedAt = at; p.lastScore = score;
  if (passed) p.completedAt = at;
  audit(s, id, tenant, passed ? 'STUDY_COMPLETED' : 'QUIZ_ATTEMPTED', moduleId);
  return { score, passed, progress: p, feedback };
}
export function studyView(s, id, tenant) {
  const actor = authorize(s, id, tenant), manage = canTeach(s, actor, tenant);
  const modules = list(s, 'trainingStudyModules').filter(m => m.tenantId === tenant).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return { tenantId: tenant, manage, member: isMember(s, id, tenant), requiredPassPercentage: 80,
    modules: modules.filter(m => manage || m.published).map(m => manage ? m : {
      id: m.id, order: m.order, publishedVersion: m.publishedVersion, published: { ...m.published, questions: m.published.questions.map(({ correctIndex, explanation, ...q }) => q) }
    }), progress: list(s, 'trainingStudyProgress').filter(p => p.tenantId === tenant && p.userId === String(id)),
    attempts: list(s, 'trainingStudyAttempts').filter(a => a.tenantId === tenant && a.userId === String(id)) };
}
export function studyReport(s, id, tenant) {
  authorize(s, id, tenant, true);
  const learnerIds = [...new Set(list(s, 'memberCommunities').filter(m => m.tenantId === tenant && isMember(s, m.memberId, tenant)).map(m => String(m.memberId)))];
  const members = learnerIds.map(id => { const u = s.users.find(u => String(u.id) === id); const trainerId = list(s, 'trainingStudyAssignments').find(a => a.tenantId === tenant && a.userId === id)?.trainerId; const trainer = trainerId && user(s, trainerId); return { id, name: [u?.firstName, u?.lastName].filter(Boolean).join(' ') || id, trainerId: trainerId || null, trainerName: trainer ? [trainer.firstName, trainer.lastName].filter(Boolean).join(' ') || trainerId : null }; });
  const progress = list(s, 'trainingStudyProgress').filter(p => p.tenantId === tenant), attempts = list(s, 'trainingStudyAttempts').filter(a => a.tenantId === tenant);
  const modules = list(s, 'trainingStudyModules').filter(m => m.tenantId === tenant && m.published);
  const rows = [];
  for (const member of members) for (const m of modules) {
    const versions = new Set([m.publishedVersion, ...progress.filter(p => p.userId === member.id && p.moduleId === m.id).map(p => p.version)]);
    for (const version of versions) {
      const p = progress.find(p => p.userId === member.id && p.moduleId === m.id && p.version === version), history = attempts.filter(a => a.userId === member.id && a.moduleId === m.id && a.version === version), last = history.at(-1);
      rows.push({ userId: member.id, name: member.name, trainer: member.trainerName || 'Unassigned', moduleTitle: p?.moduleTitle || last?.moduleTitle || m.published.title, version, status: p?.completedAt ? 'Completed' : p ? 'In progress' : 'Not started', lessonsCompleted: p?.completedLessons?.length || 0, lessonCount: p?.lessonCount ?? (version === m.publishedVersion ? m.published.lessons?.length || 0 : last?.lessonCount ?? null), attempts: history.length, scores: history.map(a => a.score), completedAt: p?.completedAt || null, lastActivityAt: p?.updatedAt || p?.startedAt || null });
    }
  }
  return { members, progress, attempts, rows, trainers: list(s, 'users').filter(u => canTeach(s, u, tenant)).map(u => ({ id: String(u.id), name: [u.firstName, u.lastName].filter(Boolean).join(' ') || String(u.id) })) };
}
export function assignStudyTrainer(s, id, tenant, memberId, trainerId) {
  authorize(s, id, tenant, true);
  if (!isMember(s, memberId, tenant)) fail(404, 'Trader not found in this tenant.');
  if (trainerId !== null && !canTeach(s, user(s, trainerId), tenant)) fail(400, 'Choose an authorised trainer for this tenant.');
  const rows = s.trainingStudyAssignments ??= [], assignment = rows.find(a => a.tenantId === tenant && a.userId === String(memberId));
  if (assignment) assignment.trainerId = trainerId; else rows.push({ tenantId: tenant, userId: String(memberId), trainerId });
  audit(s, id, tenant, 'TRAINER_ASSIGNED', null); return { saved: true };
}
export function createStudyRouter({ requireAuth, readState, updateState, databaseAvailable = false }) {
  const router = express.Router(); router.use(requireAuth);
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); if (databaseAvailable) return res.status(503).json({ message: 'Training SQL identity adapter must be configured before database cutover.' }); if (!user(readState(), req.auth.sub)) return res.sendStatus(403); next(); });
  router.get('/access', (req, res) => { const s = readState(), actor = user(s, req.auth.sub); res.json({ tenants: tenantDirectory(s).filter(t => canTeach(s, actor, t.id) || isMember(s, actor.id, t.id)).map(t => ({ ...t, manage: canTeach(s, actor, t.id) })) }); });
  router.get('/:tenantId', (req, res) => res.json(studyView(readState(), req.auth.sub, req.params.tenantId)));
  router.get('/:tenantId/report', (req, res) => res.json(studyReport(readState(), req.auth.sub, req.params.tenantId)));
  const mutate = work => async (req, res) => res.json(await updateState(s => work(s, req)));
  router.put('/:tenantId/trainers/:memberId', mutate((s, r) => assignStudyTrainer(s, r.auth.sub, r.params.tenantId, r.params.memberId, r.body?.trainerId)));
  router.post('/:tenantId/seed', mutate((s, r) => { authorize(s, r.auth.sub, r.params.tenantId, true); return { created: seedStudyDrafts(s, r.params.tenantId, r.auth.sub).length }; }));
  router.post('/:tenantId/modules', mutate((s, r) => saveStudy(s, r.auth.sub, r.params.tenantId, null, r.body)));
  router.put('/:tenantId/modules/:id', mutate((s, r) => saveStudy(s, r.auth.sub, r.params.tenantId, r.params.id, r.body)));
  router.post('/:tenantId/modules/:id/publish', mutate((s, r) => publishStudy(s, r.auth.sub, r.params.tenantId, r.params.id, r.body)));
  router.put('/:tenantId/order', mutate((s, r) => {
    authorize(s, r.auth.sub, r.params.tenantId, true);
    const modules = list(s, 'trainingStudyModules').filter(m => m.tenantId === r.params.tenantId), rows = r.body?.modules;
    if (!Array.isArray(rows) || rows.length !== modules.length || new Set(rows.map(x => x?.id)).size !== modules.length) fail(400, 'Include every tenant module exactly once.');
    for (const row of rows) revision(moduleFor(s, r.params.tenantId, row?.id), row.revision);
    rows.forEach((row, index) => { const m = moduleFor(s, r.params.tenantId, row.id); m.order = index + 1; m.revision++; });
    audit(s, r.auth.sub, r.params.tenantId, 'MODULES_REORDERED', null); return { saved: true };
  }));
  router.put('/:tenantId/modules/:id/progress', mutate((s, r) => saveStudyProgress(s, r.auth.sub, r.params.tenantId, r.params.id, r.body)));
  router.post('/:tenantId/modules/:id/attempts', rateLimit({ windowMs: 60000, limit: 20, standardHeaders: true, legacyHeaders: false }), mutate((s, r) => attemptStudy(s, r.auth.sub, r.params.tenantId, r.params.id, r.body)));
  router.use((error, req, res, next) => error.status ? res.status(error.status).json({ message: error.message }) : next(error));
  return router;
}

(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, text, className) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; };
  const button = (title, action, secondary = false) => { const b = el('button', title, secondary ? 'secondary' : ''); b.type = 'button'; b.onclick = action; return b; };
  let tenants = [], view, tenant, mode = 'learn', activeModule, report, loadId = 0, pendingSave = null;
  const notice = (message, error = false) => { $('study-notice').textContent = message; $('study-notice').className = error ? 'error' : ''; };
  async function api(path, body, method = 'POST') {
    const token = sessionStorage.getItem('duranki_access_token') || localStorage.getItem('duranki_access_token');
    const response = await fetch('/api/trader-training/study' + path, { method: body === undefined ? 'GET' : method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) throw Error(data?.message || 'Training is unavailable. Please sign in again or retry.');
    return data;
  }
  const endpoint = suffix => '/' + encodeURIComponent(tenant) + suffix;
  function field(parent, title, value = '', type = 'text') { const label = el('label', title), input = el(type === 'textarea' ? 'textarea' : 'input'); if (type !== 'textarea') input.type = type; input.value = value; label.append(input); parent.append(label); return input; }
  function badge(text, style = '') { return el('span', text, 'study-badge ' + style); }
  async function flush() { if (pendingSave) await pendingSave(); }
  async function reload() {
    const request = ++loadId, selected = tenant;
    try {
      const data = await api('/' + encodeURIComponent(selected)); if (request !== loadId) return;
      view = data; report = null; pendingSave = null; notice('');
      if (!view.manage) mode = 'learn'; else if (!view.member && mode === 'learn') mode = 'manage';
      renderModes(); render();
    } catch (e) { if (request === loadId) { pendingSave = null; $('study-content').replaceChildren(); notice(e.message, true); } }
  }
  function renderModes() {
    const modes = [];
    if (view.member) modes.push(['learn', 'My learning']);
    if (view.manage) modes.push(['manage', 'Manage modules'], ['report', 'Learner results']);
    $('study-modes').replaceChildren(...modes.map(([key, label]) => { const b = button(label, async () => { try { await flush(); mode = key; pendingSave = null; renderModes(); render(); } catch (e) { notice(e.message, true); } }, true); b.setAttribute('aria-pressed', String(mode === key)); return b; }));
  }
  function render() { $('study-content').replaceChildren(); if (mode === 'manage') renderManage(); else if (mode === 'report') renderReport(); else renderLearning(); }
  function renderManage() {
    const root = $('study-content'), heading = el('div', undefined, 'study-overview'); heading.append(el('h2', 'Study modules'));
    const actions = el('div', undefined, 'study-actions');
    actions.append(button('New module', () => openEditor(null)), button('Add starter drafts', async () => { try { const result = await api(endpoint('/seed'), {}); await reload(); notice(result.created ? result.created + ' unpublished drafts added.' : 'Starter drafts already exist.'); } catch (e) { notice(e.message, true); } }, true)); heading.append(actions); root.append(heading);
    if (!view.modules.length) root.append(el('p', 'No study modules yet.', 'study-empty'));
    const table = el('table', undefined, 'study-table'), head = el('thead'), hr = el('tr'); ['Order', 'Module', 'Publication', 'Actions'].forEach(x => hr.append(el('th', x))); head.append(hr); table.append(head);
    const body = el('tbody');
    view.modules.forEach((m, index) => {
      const row = el('tr'); row.append(el('td', String(index + 1)), el('td', m.draft.title));
      const state = el('td'); state.append(badge(m.published ? 'Published v' + m.publishedVersion : 'Unpublished', m.published ? 'complete' : 'draft'));
      if (m.published && JSON.stringify(m.draft) !== JSON.stringify(m.published)) state.append(el('div', 'Draft changes', 'study-summary')); row.append(state);
      const controls = el('td'), buttons = el('div', undefined, 'study-actions'); buttons.append(button('Edit', () => openEditor(m), true));
      for (const [delta, symbol, label] of [[-1, '\u2191', 'Move up'], [1, '\u2193', 'Move down']]) {
        const b = button(symbol, async () => { b.disabled = true; try { const ordered = [...view.modules]; [ordered[index], ordered[index + delta]] = [ordered[index + delta], ordered[index]]; await api(endpoint('/order'), { modules: ordered.map(({ id, revision }) => ({ id, revision })) }, 'PUT'); await reload(); } catch (e) { notice(e.message, true); b.disabled = false; } }, true);
        b.title = label; b.setAttribute('aria-label', label + ': ' + m.draft.title); b.classList.add('icon-button'); b.disabled = index + delta < 0 || index + delta >= view.modules.length; buttons.append(b);
      }
      controls.append(buttons); row.append(controls); body.append(row);
    });
    table.append(body); const wrap = el('div', undefined, 'table-wrap'); wrap.append(table); root.append(wrap, el('div', undefined, 'study-editor-host'));
  }
  function openEditor(module) {
    const host = document.querySelector('.study-editor-host'); host.replaceChildren(); const form = el('form', undefined, 'study-editor');
    form.append(el('h2', module ? 'Edit study module' : 'New study module'));
    if (module?.published) form.append(el('p', 'Saving changes keeps the published lesson available. Publishing a new version keeps previous results in the learner report.', 'study-summary'));
    let current = module; const draft = module?.draft || { title: '', content: '', resources: [], questions: [] };
    const title = field(form, 'Module title', draft.title), content = field(form, 'Learning objective', draft.content, 'textarea'); title.required = content.required = true; title.maxLength = 150; content.maxLength = 50000;
    form.append(el('h3', 'Lessons'));
    const lessonHost = el('div'), lessonRefs = [];
    function addLesson(lesson = { title: '', content: '' }) {
      const row = el('div', undefined, 'study-question'), name = field(row, 'Lesson title', lesson.title), text = field(row, 'Lesson content', lesson.content, 'textarea'); name.required = text.required = true;
      row.append(button('Remove lesson', () => row.remove(), true)); lessonHost.append(row); lessonRefs.push({ row, read: () => ({ title: name.value, content: text.value }) });
    }
    (draft.lessons || [{ title: 'Study material', content: draft.content }]).forEach(addLesson);
    form.append(lessonHost, button('Add lesson', () => addLesson(), true));
    const activity = field(form, 'Practical activity', draft.activity || '', 'textarea');
    form.append(el('h3', 'Videos & documents')); const resourceHost = el('div'), resourceRefs = [];
    function addResource(r = { kind: 'video', title: '', url: '' }) {
      const row = el('div', undefined, 'study-resource-editor'), label = el('label', 'Type'), kind = el('select');
      for (const [v, name] of [['video', 'Video'], ['document', 'Document']]) { const option = el('option', name); option.value = v; kind.append(option); } kind.value = r.kind; label.append(kind); row.append(label);
      const name = field(row, 'Resource title', r.title), url = field(row, 'HTTPS URL', r.url, 'url'); name.required = url.required = true;
      const remove = button('\u00d7', () => row.remove(), true); remove.title = 'Remove resource'; remove.setAttribute('aria-label', 'Remove resource'); row.append(remove); resourceHost.append(row); resourceRefs.push({ row, read: () => ({ kind: kind.value, title: name.value, url: url.value }) });
    }
    draft.resources.forEach(addResource); form.append(resourceHost, button('Add resource', () => addResource(), true), el('h3', 'Quiz'));
    const quizHost = el('div'), questions = [];
    function addQuestion(q = { prompt: '', options: ['', ''], correctIndex: 0, explanation: '' }) {
      const row = el('div', undefined, 'study-question'); const prompt = field(row, 'Question', q.prompt), options = field(row, 'Answer options (one per line)', q.options.join('\n'), 'textarea'), correct = field(row, 'Correct answer number', q.correctIndex + 1, 'number');
      prompt.required = options.required = correct.required = true; correct.min = 1; correct.max = 6; correct.step = 1;
      const explanation = field(row, 'Explanation after submission', q.explanation || '', 'textarea');
      row.append(button('Remove question', () => row.remove(), true)); quizHost.append(row); questions.push({ row, read: () => ({ prompt: prompt.value, options: options.value.split('\n'), correctIndex: Number(correct.value) - 1, explanation: explanation.value }) });
    }
    draft.questions.forEach(addQuestion); form.append(quizHost, button('Add question', () => addQuestion(), true));
    const status = el('p', '', 'study-feedback'); status.setAttribute('role', 'status');
    const save = el('button', 'Save draft'), publish = el('button', 'Save & publish'); save.type = publish.type = 'submit'; save.className = 'secondary';
    const actions = el('div', undefined, 'study-actions'); actions.append(save, publish, button('Close', () => host.replaceChildren(), true)); form.append(actions, status);
    form.onsubmit = async e => {
      e.preventDefault(); const publishNow = e.submitter === publish;
      if (publishNow && !confirm('Publish this lesson and quiz for members of ' + (tenants.find(t => t.id === tenant)?.name || tenant) + '?')) return;
      save.disabled = publish.disabled = true;
      try {
        const data = { title: title.value, content: content.value, lessons: lessonRefs.filter(r => r.row.isConnected).map(r => r.read()), activity: activity.value, resources: resourceRefs.filter(r => r.row.isConnected).map(r => r.read()), questions: questions.filter(q => q.row.isConnected).map(q => q.read()), revision: current?.revision };
        current = await api(endpoint('/modules' + (current ? '/' + current.id : '')), data, current ? 'PUT' : 'POST');
        if (publishNow) await api(endpoint('/modules/' + current.id + '/publish'), { revision: current.revision });
        await reload(); notice(publishNow ? 'Module published.' : 'Draft saved.');
      } catch (e) { status.textContent = e.message; status.classList.add('error'); save.disabled = publish.disabled = false; }
    };
    host.append(form); form.scrollIntoView({ behavior: 'smooth', block: 'start' }); title.focus({ preventScroll: true });
  }
  function renderLearning() {
    const root = $('study-content'), modules = view.modules.filter(m => m.published);
    const completed = modules.filter(m => view.progress.some(p => p.moduleId === m.id && p.version === m.publishedVersion && p.completedAt)).length;
    const heading = el('div', undefined, 'study-overview'); heading.append(el('h2', 'My learning'), el('span', completed + ' of ' + modules.length + ' complete')); root.append(heading);
    if (!modules.length) { root.append(el('p', 'No study modules are published for this tenant yet.', 'study-empty')); return; }
    if (!modules.some(m => m.id === activeModule)) activeModule = modules.find(m => view.progress.some(p => p.moduleId === m.id && p.version === m.publishedVersion && !p.completedAt))?.id || modules[0].id;
    const layout = el('div', undefined, 'study-layout'), outline = el('aside', undefined, 'study-outline'), reader = el('article', undefined, 'study-reader'); outline.setAttribute('aria-label', 'Study module list');
    for (const [index, m] of modules.entries()) {
      const p = view.progress.find(p => p.moduleId === m.id && p.version === m.publishedVersion);
      const b = button((index + 1) + '. ' + m.published.title, async () => { try { await flush(); activeModule = m.id; pendingSave = null; renderLearningFresh(); } catch (e) { notice(e.message, true); } }, true);
      b.append(el('small', p?.completedAt ? 'Completed' : p ? 'Continue learning' : 'Not started')); b.setAttribute('aria-current', String(m.id === activeModule)); outline.append(b);
    }
    layout.append(outline, reader); root.append(layout);
    const m = modules.find(m => m.id === activeModule), lesson = m.published, previous = view.progress.find(p => p.moduleId === m.id && p.version === m.publishedVersion);
    const modulePath = endpoint('/modules/' + m.id), learningView = view;
    const lessons = lesson.lessons || [], passPercentage = lesson.passPercentage ?? 100;
    let lessonId = previous?.lessonId || lessons[0]?.id, completedLessons = new Set(previous?.completedLessons || []);
    let section = previous?.section || 'lesson', answers = { ...(previous?.answers || {}) }, videoTimes = { ...(previous?.videoTimes || {}) }, dirty = false, timer, saving = Promise.resolve();
    reader.append(el('h2', lesson.title), badge(previous?.completedAt ? 'Completed' : 'Version ' + m.publishedVersion, previous?.completedAt ? 'complete' : ''));
    const tabs = el('div', undefined, 'study-tabs'), status = el('p', '', 'study-feedback'); status.setAttribute('role', 'status'); const panes = {};
    async function save() {
      clearTimeout(timer); if (!dirty) return saving;
      dirty = false; const payload = { version: m.publishedVersion, section, lessonId, completedLessons: [...completedLessons], answers: { ...answers }, videoTimes: { ...videoTimes } }, path = modulePath + '/progress';
      saving = saving.catch(() => {}).then(async () => { try { const p = await api(path, payload, 'PUT'); const index = learningView.progress.findIndex(p => p.moduleId === m.id && p.version === m.publishedVersion); if (index < 0) learningView.progress.push(p); else learningView.progress[index] = p; status.textContent = 'Progress saved'; status.classList.remove('error'); } catch (e) { dirty = true; status.textContent = e.message; status.classList.add('error'); throw e; } }); return saving;
    }
    pendingSave = save;
    function schedule() { if (!reader.isConnected) return; dirty = true; status.textContent = 'Saving...'; clearTimeout(timer); timer = setTimeout(() => save().catch(() => {}), 700); }
    for (const [key, label] of [['lesson', 'Study'], ['resources', 'Resources'], ['quiz', 'Quiz']]) {
      const pane = el('div'); pane.hidden = section !== key; panes[key] = pane;
      const b = button(label, () => { section = key; Object.entries(panes).forEach(([name, panel]) => panel.hidden = name !== key); [...tabs.children].forEach(n => n.setAttribute('aria-selected', String(n === b))); schedule(); }, true); b.setAttribute('aria-selected', String(section === key)); tabs.append(b);
    }
    panes.lesson.append(el('h3', 'Learning objective'), el('div', lesson.content, 'lesson'));
    const lessonCount = el('p'), selectorLabel = el('label', 'Lesson'), lessonSelect = el('select'), lessonBody = el('div');
    lessonSelect.setAttribute('aria-label', 'Current lesson'); selectorLabel.append(lessonSelect);
    lessons.forEach(l => { const option = el('option', l.title); option.value = l.id; lessonSelect.append(option); });
    lessonSelect.value = lessonId || '';
    let quizSubmit;
    const allLessonsDone = () => lessons.every(l => completedLessons.has(l.id));
    function showLesson() {
      lessonBody.replaceChildren(); const current = lessons.find(l => l.id === lessonId);
      lessonCount.textContent = completedLessons.size + ' of ' + lessons.length + ' lessons complete';
      if (quizSubmit) quizSubmit.disabled = !allLessonsDone();
      if (!current) return;
      lessonBody.append(el('h3', current.title), el('div', current.content, 'lesson'));
      const label = el('label', undefined, 'study-lesson-complete'), checkbox = el('input'); checkbox.type = 'checkbox'; checkbox.checked = completedLessons.has(current.id); checkbox.disabled = !!previous?.completedAt;
      label.append(checkbox, el('span', 'Mark this lesson complete')); lessonBody.append(label);
      checkbox.onchange = async () => { if (checkbox.checked) completedLessons.add(current.id); else completedLessons.delete(current.id); dirty = true; showLesson(); try { await save(); } catch {} };
    }
    lessonSelect.onchange = () => { lessonId = lessonSelect.value; showLesson(); schedule(); };
    if (lessons.length) panes.lesson.append(lessonCount, selectorLabel, lessonBody);
    if (lesson.activity) panes.lesson.append(el('h3', 'Practical activity'), el('div', lesson.activity, 'lesson'));
    showLesson();
    panes.resources.append(el('p', 'Optional resources. Videos are not required to complete this module.', 'study-summary'));
    if (!lesson.resources.length) panes.resources.append(el('p', 'No additional resources for this module.', 'study-empty'));
    for (const resource of lesson.resources) {
      const block = el('div', undefined, 'study-resource'); block.append(el('h3', resource.title));
      const link = el('a', resource.kind === 'document' ? 'Download / open document' : 'Open video'); link.href = resource.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; block.append(link);
      if (resource.kind === 'video' && /\.(mp4|webm|ogv)(\?|$)/i.test(resource.url)) {
        const video = el('video'); video.controls = true; video.preload = 'none'; video.src = resource.url;
        video.onloadedmetadata = () => { if (videoTimes[resource.id]) video.currentTime = Math.min(videoTimes[resource.id], Number.isFinite(video.duration) ? video.duration : videoTimes[resource.id]); };
        video.onpause = video.onended = () => { videoTimes[resource.id] = video.currentTime; schedule(); };
        let last = 0; video.ontimeupdate = () => { if (Date.now() - last > 15000) { last = Date.now(); videoTimes[resource.id] = video.currentTime; schedule(); } };
        video.onerror = () => { if (!block.querySelector('.media-error')) block.append(el('p', 'Video playback is unavailable. Use the video link above.', 'media-error')); };
        block.append(video);
      }
      panes.resources.append(block);
    }
    function showFeedback(host, attempt) {
      host.replaceChildren(); if (!attempt) return;
      host.append(el('h3', 'Your result: ' + attempt.score + '%'));
      for (const f of attempt.feedback || []) { const block = el('section', undefined, 'study-question'); block.append(el('h4', f.prompt), el('p', (f.correct ? 'Correct' : 'Incorrect') + '. Your answer: ' + f.selectedAnswer), el('p', 'Correct answer: ' + f.correctAnswer), el('p', f.explanation)); host.append(block); }
    }
    const explanations = el('div');
    const lastAttempt = (view.attempts || []).filter(a => a.moduleId === m.id && a.version === m.publishedVersion).at(-1);
    showFeedback(explanations, lastAttempt);
    if (previous?.completedAt) panes.quiz.append(el('p', 'Quiz passed with ' + (previous.lastScore ?? 100) + '%. Completed ' + new Date(previous.completedAt).toLocaleDateString() + '.'));
    else {
      const form = el('form', undefined, 'study-quiz');
      for (const q of lesson.questions) { const group = el('fieldset'); group.append(el('legend', q.prompt)); for (const [index, answer] of q.options.entries()) { const label = el('label', undefined, 'choice'), radio = el('input'); radio.type = 'radio'; radio.name = q.id; radio.value = index; radio.required = true; radio.checked = answers[q.id] === index; radio.onchange = () => { answers[q.id] = index; schedule(); }; label.append(radio, el('span', answer)); group.append(label); } form.append(group); }
      const submit = el('button', 'Submit quiz'), feedback = el('p', '', 'study-feedback'); quizSubmit = submit; submit.disabled = !allLessonsDone(); feedback.setAttribute('role', 'status'); form.append(submit, feedback);
      form.onsubmit = async e => { e.preventDefault(); submit.disabled = true; try { await save(); const result = await api(modulePath + '/attempts', { version: m.publishedVersion, answers }); showFeedback(explanations, result); if (result.passed) { pendingSave = null; await reload(); notice('Quiz passed: ' + result.score + '%. Module completion recorded.'); } else feedback.textContent = 'Score: ' + result.score + '%. Review the explanations and retry. Pass mark: ' + passPercentage + '%.'; } catch (e) { feedback.textContent = e.message; } finally { submit.disabled = !allLessonsDone(); } };
      panes.quiz.append(el('p', 'Complete all lessons first. Pass mark: ' + passPercentage + '%. Each question is worth one point. Retries are allowed.', 'study-summary'), form);
    }
    panes.quiz.append(explanations);
    reader.append(tabs, ...Object.values(panes), button('Save progress', async () => { dirty = true; try { await save(); } catch {} }, true), status);
    function renderLearningFresh() { $('study-content').replaceChildren(); renderLearning(); }
  }
  async function renderReport() {
    const selected = tenant, request = loadId, root = $('study-content'); root.append(el('h2', 'Learner results'));
    try {
      report = await api(endpoint('/report')); if (tenant !== selected || request !== loadId || mode !== 'report') return;
      const label = el('label', 'Find trader'), filter = el('input'); filter.type = 'search'; filter.placeholder = 'Name or member ID'; label.className = 'study-report-filter'; label.append(filter); root.append(label);
      const exportButton = button('Export results CSV', () => exportReport()); root.append(exportButton);
      const assignment = el('form', undefined, 'study-trainer-assignment'), learnerLabel = el('label', 'Trader'), learnerSelect = el('select'), trainerLabel = el('label', 'Assigned trainer'), trainerSelect = el('select');
      learnerSelect.setAttribute('aria-label', 'Assign trader'); trainerSelect.setAttribute('aria-label', 'Assigned trainer');
      report.members.forEach(m => { const o = el('option', m.name + ' (' + m.id + ')'); o.value = m.id; learnerSelect.append(o); });
      const unassigned = el('option', 'Unassigned'); unassigned.value = ''; trainerSelect.append(unassigned);
      report.trainers.forEach(t => { const o = el('option', t.name); o.value = t.id; trainerSelect.append(o); });
      learnerSelect.onchange = () => { trainerSelect.value = report.members.find(m => m.id === learnerSelect.value)?.trainerId || ''; }; learnerSelect.onchange();
      const assign = el('button', 'Save trainer'); assign.type = 'submit'; assign.disabled = !report.members.length;
      learnerLabel.append(learnerSelect); trainerLabel.append(trainerSelect); assignment.append(learnerLabel, trainerLabel, assign); root.append(assignment);
      assignment.onsubmit = async e => { e.preventDefault(); assign.disabled = true; try { await api('/' + encodeURIComponent(selected) + '/trainers/' + encodeURIComponent(learnerSelect.value), { trainerId: trainerSelect.value || null }, 'PUT'); await reload(); notice('Trainer assignment saved.'); } catch (error) { notice(error.message, true); assign.disabled = false; } };
      const wrap = el('div', undefined, 'table-wrap'); root.append(wrap);
      const records = el('details'), summary = el('summary', 'Quiz attempt history'); records.append(summary); const attemptsWrap = el('div', undefined, 'table-wrap'); records.append(attemptsWrap); root.append(records);
      function draw() {
        const term = filter.value.toLowerCase(); const matches = member => (member.name + ' ' + member.id).toLowerCase().includes(term);
        const members = report.members.filter(matches), ids = new Set(members.map(m => m.id));
        const date = value => value ? new Date(value).toLocaleString() : '-';
        const rows = report.rows.filter(r => ids.has(r.userId)).map(r => [r.name, r.userId, r.trainer, r.moduleTitle, r.version, r.status, r.lessonsCompleted + ' / ' + (r.lessonCount ?? '?'), r.attempts, r.scores.map(s => s + '%').join(', ') || '-', date(r.completedAt), date(r.lastActivityAt)]);
        wrap.replaceChildren(table(['Trader', 'Member ID', 'Trainer', 'Module', 'Version', 'Status', 'Lessons', 'Attempts', 'Scores', 'Completed', 'Last activity'], rows));
        const attempts = report.attempts.filter(a => ids.has(a.userId) || (!term && !report.members.some(m => m.id === a.userId)));
        attemptsWrap.replaceChildren(table(['Trader / ID', 'Module', 'Version', 'Score', 'Result', 'Submitted'], attempts.map(a => [report.members.find(m => m.id === a.userId)?.name || a.userId, a.moduleTitle, a.version, a.score + '%', a.passed ? 'Passed' : 'Retry', new Date(a.at).toLocaleString()])));
      }
      filter.oninput = draw; draw();
    } catch (e) { if (tenant === selected) notice(e.message, true); }
  }
  function table(headings, rows) { const t = el('table', undefined, 'study-table'), head = el('thead'), tr = el('tr'); headings.forEach(h => tr.append(el('th', h))); head.append(tr); t.append(head); const body = el('tbody'); rows.forEach(row => { const tr = el('tr'); row.forEach(value => tr.append(el('td', String(value)))); body.append(tr); }); if (!rows.length) { const tr = el('tr'), cell = el('td', 'No results yet.'); cell.colSpan = headings.length; tr.append(cell); body.append(tr); } t.append(body); return t; }
  function exportReport() { const rows = [['Member ID', 'Trader', 'Trainer', 'Module', 'Version', 'Status', 'Lessons completed', 'Lesson count', 'Attempts', 'Scores', 'Completed', 'Last activity'], ...report.rows.map(r => [r.userId, r.name, r.trainer, r.moduleTitle, r.version, r.status, r.lessonsCompleted, r.lessonCount ?? '', r.attempts, r.scores.join('; '), r.completedAt || '', r.lastActivityAt || ''])]; const safe = value => '"' + String(value).replace(/^[\s]*[=+@-]/, s => "'" + s).replaceAll('"', '""') + '"'; const url = URL.createObjectURL(new Blob([rows.map(r => r.map(safe).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })); const a = el('a'); a.href = url; a.download = 'study-results.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  for (const [tab, other, pane, otherPane] of [['study-tab', 'grant-tab', 'study-workspace', 'grant-workspace'], ['grant-tab', 'study-tab', 'grant-workspace', 'study-workspace']]) $(tab).onclick = async () => { try { await flush(); $(tab).setAttribute('aria-selected', 'true'); $(other).setAttribute('aria-selected', 'false'); $(pane).hidden = false; $(otherPane).hidden = true; } catch (e) { notice(e.message, true); } };
  $('study-tenant').onchange = async () => { const chosen = $('study-tenant').value; try { await flush(); tenant = chosen; activeModule = null; await reload(); } catch (e) { $('study-tenant').value = tenant; notice(e.message, true); } };
  async function boot() { try { const access = await api('/access'); tenants = access.tenants; $('study-tenant').replaceChildren(...tenants.map(t => { const o = el('option', t.name); o.value = t.id; return o; })); if (!tenants.length) { notice('No community membership or training permissions are available.'); return; } const requested = new URLSearchParams(location.search).get('tenantId'); tenant = tenants.find(t => t.id === requested)?.id || tenants.find(t => t.id === 'tenant-trader-connect')?.id || tenants[0].id; $('study-tenant').value = tenant; await reload(); } catch (e) { notice(e.message, true); } }
  boot();
})();

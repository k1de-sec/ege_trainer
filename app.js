(() => {
  'use strict';
  const DATA_URL = './tasks_data.json';
  const FIPI_LINKS_URL = './fipi_links.json';
  const STORAGE_KEY = 'ege-trainer-progress-v2';
  const EXAM_SECONDS = 180 * 60;
  const $ = (selector) => document.querySelector(selector);
  const el = {
    taskList: $('#task-list'), taskContent: $('#task-content'), search: $('#task-search'),
    typeFilter: $('#type-filter'), topicModeSelect: $('#topic-mode-select'), topicGroupGrid: $('#topic-group-grid'),
    startTopicPracticeButton: $('#start-topic-practice-button'), listCount: $('#list-count'), statTotal: $('#stat-total'),
    statDone: $('#stat-done'), statPercent: $('#stat-percent'), progressFraction: $('#progress-fraction'),
    progressBar: $('#progress-bar'), resetProgress: $('#reset-progress'), resetDialog: $('#reset-dialog'),
    confirmReset: $('#confirm-reset'), continueButton: $('#continue-button'), toast: $('#toast'),
    statDoneLabel: $('#stat-done-label'), statTotalLabel: $('#stat-total-label'),
    allTasksButton: $('#all-tasks-button'), randomSetButton: $('#random-set-button'), startWarmupButton: $('#start-warmup-button'),
    randomFipiTaskButton: $('#random-fipi-task-button'),
    startExamButton: $('#start-exam-button'), examStatus: $('#exam-status'),
    examTimer: $('#exam-timer'), examTimerTrack: $('#exam-timer-track'),
    examProgress: $('#exam-progress'), finishExamButton: $('#finish-exam-button'),
    modeDescription: $('#mode-description'), examResultDialog: $('#exam-result-dialog'),
    examResultContent: $('#exam-result-content')
  };
  const state = {
    bankTasks: [], tasks: [], visible: [], currentId: null,
    solved: new Set(), attempts: {}, values: {}, solutionOpen: false,
    toastTimer: null, mode: 'catalog', examEndAt: null,
    examAnswers: {}, timerHandle: null, restoreSession: null, fipiLinks: null
  };

  function readProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem('ege-trainer-progress-v1') || '{}');
      state.solved = new Set(Array.isArray(saved.solved) ? saved.solved : []);
      state.attempts = saved.attempts && typeof saved.attempts === 'object' ? saved.attempts : {};
      state.values = saved.values && typeof saved.values === 'object' ? saved.values : {};
      state.currentId = typeof saved.currentId === 'string' ? saved.currentId : null;
      state.examAnswers = saved.examAnswers && typeof saved.examAnswers === 'object' ? saved.examAnswers : {};
      state.restoreSession = saved.mode && saved.mode !== 'catalog' ? {
        mode: saved.mode,
        activeTaskIds: Array.isArray(saved.activeTaskIds) ? saved.activeTaskIds : [],
        examEndAt: Number(saved.examEndAt) || null
      } : null;
    } catch (_) { /* Storage may be disabled; the app still works for this session. */ }
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        solved: [...state.solved], attempts: state.attempts, values: state.values,
        currentId: state.currentId, mode: state.mode,
        activeTaskIds: state.mode === 'catalog' ? [] : state.tasks.map((task) => task.externalId),
        examEndAt: state.mode === 'exam' ? state.examEndAt : null,
        examAnswers: state.examAnswers
      }));
      const status = document.querySelector('.saved-status');
      if (status) status.innerHTML = '<span class="status-dot"></span> Прогресс сохранён';
    } catch (_) {
      const status = document.querySelector('.saved-status');
      if (status) status.innerHTML = '<span class="status-dot" style="background:#ed9552"></span> Только в сессии';
    }
    updateStats();
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function renderMathExpression(source) {
    // Our task bank uses a small, well-defined subset of LaTeX. Render it locally so
    // formulas do not leak commands such as \cdot or \frac into the explanation.
    let math = escapeHtml(source);
    const symbols = {
      '\\cdot': ' · ', '\\times': ' × ', '\\div': '÷', '\\pm': '±',
      '\\leq': '≤', '\\le': '≤', '\\geq': '≥', '\\ge': '≥',
      '\\neq': '≠', '\\approx': '≈', '\\infty': '∞', '\\pi': 'π',
      '\\to': '→', '\\Rightarrow': '⇒', '\\%': '%', '\\,': ' ', '\\;': ' '
    };
    for (const [command, glyph] of Object.entries(symbols)) math = math.replaceAll(command, glyph);
    math = math.replace(/\\left\b|\\right\b/g, '');
    math = math.replace(/\\operatorname\s*\{([^{}]*)\}/g, '$1');
    math = math.replace(/([A-Za-z0-9)])\^([0-9]+)/g, '$1<sup>$2</sup>');
    math = math.replace(/([A-Za-z)])_\{([^{}]+)\}/g, '$1<sub>$2</sub>');
    math = math.replace(/\\sqrt\s*\{([^{}]+)\}/g, '√($1)');
    math = math.replace(/\\sqrt\s*([0-9]+)/g, '√($1)');
    math = math.replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '<span class="math-fraction"><span class="math-numerator">$1</span><span class="math-denominator">$2</span></span>');
    math = math.replace(/\\frac\s*(\d)\s*(\d)/g, '<span class="math-fraction"><span class="math-numerator">$1</span><span class="math-denominator">$2</span></span>');
    math = math.replace(/\\text\s*\{([^{}]*)\}/g, '$1');
    return math;
  }

  function inlineMarkdown(value) {
    const mathParts = [];
    const protectedSource = String(value ?? '').replace(/\\\((.+?)\\\)|\\\[([\s\S]+?)\\\]/g, (_match, inline, display) => {
      const index = mathParts.push(renderMathExpression(inline ?? display)) - 1;
      return `MATHPROTECTED${index}TOKEN`;
    });
    let text = escapeHtml(protectedSource);
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
    text = text.replace(/MATHPROTECTED(\d+)TOKEN/g, (_match, index) => `<span class="math-inline">${mathParts[Number(index)] ?? ''}</span>`);
    return text;
  }

  function renderMarkdown(source) {
    // A few early task records stored paragraph breaks as the literal two-character
    // sequence \\n instead of real newlines. Restore those only before Markdown
    // boundaries so LaTeX commands such as \\neq remain intact.
    const normalizedSource = String(source ?? '').replace(/\r/g, '')
      .replace(/\\n(?=\\n|\s*(?:\*\*|#{1,3}\s|[-*+]\s|\d+[.)]\s|>))/g, '\n');
    const lines = normalizedSource.split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        const cells = (s) => s.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((part) => part.trim());
        const headers = cells(line);
        i += 2;
        const rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
        out.push('<div class="table-scroll"><table><thead><tr>' + headers.map((c) => `<th>${inlineMarkdown(c)}</th>`).join('') + '</tr></thead><tbody>' + rows.map((row) => '<tr>' + headers.map((_, index) => `<td>${inlineMarkdown(row[index] ?? '')}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
        continue;
      }
      const heading = line.match(/^\s*(#{1,3})\s+(.+)/);
      if (heading) { const level = Math.min(3, heading[1].length); out.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`); i++; continue; }
      if (/^\s*>\s?/.test(line)) {
        const quote = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) { quote.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
        out.push(`<blockquote>${quote.map(inlineMarkdown).join('<br>')}</blockquote>`); continue;
      }
      if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
        const ordered = /^\s*\d+[.)]\s+/.test(line);
        const tag = ordered ? 'ol' : 'ul';
        const items = [];
        while (i < lines.length && (ordered ? /^\s*\d+[.)]\s+/.test(lines[i]) : /^\s*[-*+]\s+/.test(lines[i]))) {
          items.push(`<li>${inlineMarkdown(lines[i].replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/, ''))}</li>`); i++;
        }
        out.push(`<${tag}>${items.join('')}</${tag}>`); continue;
      }
      const paragraph = [line.trim()]; i++;
      while (i < lines.length && lines[i].trim() && !/^\s*(#{1,3}\s|>\s?|[-*+]\s+|\d+[.)]\s+)/.test(lines[i]) && !/^\s*\|.*\|\s*$/.test(lines[i])) { paragraph.push(lines[i].trim()); i++; }
      out.push(`<p>${paragraph.map(inlineMarkdown).join('<br>')}</p>`);
    }
    return out.join('\n');
  }

  function normalizeAnswer(value) {
    return String(value ?? '').trim().toLowerCase().replace(/[−–—]/g, '-').replace(/\s+/g, '').replace(/,/g, '.');
  }

  function answersMatch(userAnswer, correctAnswer) {
    const a = normalizeAnswer(userAnswer);
    const b = normalizeAnswer(correctAnswer);
    if (!a || !b) return false;
    if (a === b) return true;
    const numberA = Number(a), numberB = Number(b);
    return Number.isFinite(numberA) && Number.isFinite(numberB) && Math.abs(numberA - numberB) < 1e-9;
  }

  function currentTask() { return state.tasks.find((task) => task.externalId === state.currentId) || state.tasks[0]; }
  function sortTasks(tasks) {
    return [...tasks].sort((a, b) => Number(a.taskNumber) - Number(b.taskNumber) || Number(a.variantIndex || 1) - Number(b.variantIndex || 1));
  }

  const TOPIC_GROUPS = [
    { title: 'Практические и текстовые задачи', description: 'Покупки, величины, формулы и движение.', icon: '↗', className: 'topic-group-practical', numbers: [1, 2, 4, 6, 20] },
    { title: 'Данные, графики и вероятность', description: 'Таблицы, диаграммы, события и логические утверждения.', icon: '▤', className: 'topic-group-data', numbers: [3, 5, 7, 8] },
    { title: 'Геометрия и пространственное мышление', description: 'Клетчатая сетка, площади, объёмы и геометрические выводы.', icon: '△', className: 'topic-group-geometry', numbers: [9, 10, 11, 12, 13, 21] },
    { title: 'Числа, вычисления и алгебра', description: 'Действия, проценты, выражения, уравнения и свойства чисел.', icon: '∑', className: 'topic-group-algebra', numbers: [14, 15, 16, 17, 18, 19] }
  ];

  function renderTopicGroups() {
    if (!el.topicGroupGrid) return;
    el.topicGroupGrid.innerHTML = TOPIC_GROUPS.map((group, groupIndex) => {
      const availableTopics = group.numbers.map((number) => {
        const tasks = state.bankTasks.filter((task) => Number(task.taskNumber) === number);
        if (!tasks.length) return '';
        const first = tasks[0];
        return `<button type="button" class="topic-variant-row" data-topic-number="${number}" aria-label="Открыть варианты задания ${number}: ${escapeHtml(first.taskType || first.title)}"><span class="topic-number-badge">№${number}</span><span class="topic-row-copy"><strong>${escapeHtml(first.taskType || first.title)}</strong><small>${escapeHtml(first.title)}</small></span><span class="topic-variant-count">${tasks.length} вар.</span><span class="topic-row-arrow" aria-hidden="true">→</span></button>`;
      }).filter(Boolean).join('');
      const count = group.numbers.reduce((sum, number) => sum + state.bankTasks.filter((task) => Number(task.taskNumber) === number).length, 0);
      return `<details class="topic-group-card ${group.className}" ${groupIndex === 0 ? 'open' : ''}><summary><span class="topic-group-icon">${group.icon}</span><span class="topic-group-heading"><strong>${escapeHtml(group.title)}</strong><small>${escapeHtml(group.description)}</small></span><span class="topic-group-count">${group.numbers.length} тем · ${count} задач</span><span class="topic-group-chevron" aria-hidden="true">⌄</span></summary><div class="topic-variant-list">${availableTopics}</div></details>`;
    }).join('');
  }

  function toast(message) {
    el.toast.textContent = message;
    el.toast.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2800);
  }

  function updateStats() {
    const total = state.tasks.length;
    const isExam = state.mode === 'exam';
    const done = isExam
      ? state.tasks.filter((task) => String(state.examAnswers[task.externalId] ?? '').trim()).length
      : state.tasks.filter((task) => state.solved.has(task.externalId)).length;
    const percent = total ? Math.round(done / total * 100) : 0;
    el.statTotal.textContent = String(total);
    el.statDone.textContent = String(done);
    el.statPercent.textContent = `${percent}%`;
    el.progressFraction.textContent = `${done} / ${total}`;
    el.progressBar.style.width = `${percent}%`;
    if (el.statTotalLabel) el.statTotalLabel.textContent = state.mode === 'catalog' ? 'заданий в базе' : state.mode === 'exam' ? 'заданий в варианте' : state.mode === 'topic' ? 'вариантов в отработке' : state.mode === 'warmup' ? 'заданий в разминке' : 'заданий в подборке';
    if (el.statDoneLabel) el.statDoneLabel.textContent = isExam ? 'ответов сохранено' : 'решено верно';
    const selected = state.tasks.find((task) => task.externalId === state.currentId);
    if (selected) {
      const currentButton = document.querySelector('.task-item.selected');
      if (currentButton) {
        currentButton.classList.toggle('done', !isExam && state.solved.has(selected.externalId));
        currentButton.classList.toggle('answered', isExam && String(state.examAnswers[selected.externalId] ?? '').trim().length > 0);
      }
    }
    if (el.examProgress) el.examProgress.textContent = `${done} / ${total} ответов`;
  }

  function populateFilters() {
    const types = [...new Set(state.bankTasks.map((task) => task.taskType).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
    el.typeFilter.innerHTML = '<option value="all">Все темы</option>' + types.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join('');
    if (el.topicModeSelect) {
      el.topicModeSelect.innerHTML = '<option value="">Выбери тип задания</option>' + types.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join('');
    }
  }

  function renderTaskList() {
    const query = el.search.value.trim().toLocaleLowerCase('ru');
    const type = el.typeFilter.value;
    state.visible = state.tasks.filter((task) => {
      const matchesType = type === 'all' || task.taskType === type;
      const matchesQuery = !query || `${task.title} ${task.taskType} ${task.statement} ${(task.keywords || []).join(' ')}`.toLocaleLowerCase('ru').includes(query);
      return matchesType && matchesQuery;
    });
    el.listCount.textContent = String(state.visible.length);
    if (!state.visible.length) {
      el.taskList.innerHTML = '<div class="empty-state"><strong>Ничего не нашлось</strong>Попробуй изменить поисковый запрос или выбрать другую тему.</div>';
      return;
    }
    el.taskList.innerHTML = state.visible.map((task) => {
      const done = state.mode !== 'exam' && state.solved.has(task.externalId);
      const answered = state.mode === 'exam' && String(state.examAnswers[task.externalId] ?? '').trim().length > 0;
      const selected = task.externalId === state.currentId;
      const numberLabel = answered ? '•' : done ? '✓' : task.taskNumber;
      return `<button type="button" class="task-item${selected ? ' selected' : ''}${done ? ' done' : ''}${answered ? ' answered' : ''}" data-task-id="${escapeHtml(task.externalId)}" aria-current="${selected ? 'true' : 'false'}"><span class="task-number">${numberLabel}</span><span class="task-main"><span class="task-name">${escapeHtml(task.title)}</span><span class="task-meta">${escapeHtml(task.taskType || 'Тренировка')}</span></span>${done ? '<span class="task-done-mark" aria-label="Решено верно">✓</span>' : answered ? '<span class="task-done-mark" aria-label="Ответ сохранён">•</span>' : ''}</button>`;
    }).join('');
    updateStats();
  }

  function updateModeUI() {
    const isExam = state.mode === 'exam';
    document.body.classList.toggle('is-exam-mode', isExam);
    if (el.examStatus) el.examStatus.hidden = !isExam;
    if (el.allTasksButton) el.allTasksButton.disabled = isExam;
    if (el.randomSetButton) el.randomSetButton.disabled = isExam;
    if (el.randomFipiTaskButton) el.randomFipiTaskButton.disabled = isExam;
    if (el.startExamButton) el.startExamButton.disabled = isExam;
    if (el.startTopicPracticeButton) el.startTopicPracticeButton.disabled = isExam;
    if (el.startWarmupButton) el.startWarmupButton.disabled = isExam;
    if (el.topicModeSelect) el.topicModeSelect.disabled = isExam;
    if (el.search) el.search.disabled = isExam;
    if (el.typeFilter) el.typeFilter.disabled = isExam;
    if (el.modeDescription) {
      const activeType = state.tasks[0]?.taskType || '';
      el.modeDescription.textContent = isExam
        ? 'Авторский пробный вариант активен. Ответы проверятся после завершения; разборы пока скрыты.'
        : state.mode === 'topic'
          ? `Отработка по типу «${activeType}»: ${state.tasks.length} авторских вариантов одного типа, без таймера.`
          : state.mode === 'collection'
            ? 'Смешанная авторская подборка: по одному заданию каждого из 21 типов, без таймера.'
            : state.mode === 'warmup'
              ? 'Короткая разминка: 5 случайных авторских задач из разных типов, без таймера.'
              : `В базе ${state.bankTasks.length} авторских задач — по ${Math.floor(state.bankTasks.length / 21)} на каждый номер. Официальные примеры ФИПИ открываются отдельно.`;
    }
    if (!isExam) stopTimer();
    updateStats();
  }

  function selectTask(id, options = {}) {
    const task = state.tasks.find((item) => item.externalId === id);
    if (!task) return;
    state.currentId = task.externalId;
    state.solutionOpen = false;
    if (!options.silent) saveProgress();
    renderTaskList();
    renderCurrentTask();
    if (options.scroll) $('.practice-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderCurrentTask() {
    const task = currentTask();
    if (!task) {
      el.taskContent.innerHTML = '<div class="empty-state"><strong>Пока нет заданий</strong>Проверь файл базы данных и обнови страницу.</div>';
      return;
    }
    const index = state.tasks.findIndex((item) => item.externalId === task.externalId);
    const isExam = state.mode === 'exam';
    const solved = state.solved.has(task.externalId);
    const answer = isExam ? (state.examAnswers[task.externalId] ?? '') : (state.values[task.externalId] ?? '');
    const hasAnswer = task.correctAnswer !== null && task.correctAnswer !== undefined && String(task.correctAnswer).trim() !== '';
    const mistakes = Array.isArray(task.commonMistakes) ? task.commonMistakes : [];
    const explanation = task.explanation || 'Для этого задания пока не добавлен разбор.';
    const statementType = task.sourceType === 'author_generated' ? 'Авторская вариация' : (task.sourceLabel || 'Авторская задача');
    const answerButtonText = isExam ? 'Сохранить ответ' : 'Проверить ответ';
    const taskActions = isExam
      ? `<div class="task-actions"><span class="exam-answer-note">Вариант проверится после завершения. Ответы сохраняются автоматически.</span><div class="nav-buttons"><button class="secondary-button" id="prev-task" type="button" ${index <= 0 ? 'disabled' : ''}>← Назад</button><button class="next-button" id="next-task" type="button">${index >= state.tasks.length - 1 ? 'Завершить вариант' : 'Следующее'} →</button></div></div>`
      : `<div class="task-actions task-actions-with-source"><div class="task-action-links"><button class="link-button" id="toggle-solution" type="button"><span aria-hidden="true">${state.solutionOpen ? '⌃' : '⊕'}</span>${state.solutionOpen ? 'Скрыть разбор' : 'Посмотреть разбор'}</button><button class="link-button fipi-task-link" id="open-fipi-task" type="button">Пример ФИПИ №${escapeHtml(task.taskNumber)} ↗</button></div><div class="nav-buttons"><button class="secondary-button" id="prev-task" type="button" ${index <= 0 ? 'disabled' : ''}>← Назад</button><button class="next-button" id="next-task" type="button">${index >= state.tasks.length - 1 ? 'К началу' : 'Следующее'} →</button></div></div>`;
    const solutionPanel = isExam ? '' : `<section class="solution-panel${state.solutionOpen ? ' open' : ''}" id="solution-panel" aria-label="Разбор решения"><div class="solution-header"><span class="solution-badge">ƒx</span><h3>Разбор решения</h3></div><div class="solution-body">${renderMarkdown(explanation)}</div><div class="answer-reveal"><span>Правильный ответ</span><strong>${escapeHtml(task.correctAnswer)}</strong></div>${mistakes.length ? `<div class="mistakes"><div class="mistakes-title">На что обратить внимание</div><ul>${mistakes.map((mistake) => `<li>${escapeHtml(mistake)}</li>`).join('')}</ul></div>` : ''}</section>`;
    el.taskContent.innerHTML = `
      <div class="task-top"><div class="task-breadcrumb">Математика (база) <span>›</span> <b>Задание ${escapeHtml(task.taskNumber)}</b></div><span class="task-status${solved && !isExam ? ' done' : ''}">${isExam ? `Авторский вариант · ${index + 1} из ${state.tasks.length}` : state.mode === 'topic' ? `Отработка типа · ${index + 1} из ${state.tasks.length}` : state.mode === 'collection' ? `Смешанная подборка · ${index + 1} из ${state.tasks.length}` : state.mode === 'warmup' ? `Разминка · ${index + 1} из ${state.tasks.length}` : solved ? '✓ Решено верно' : `База · ${index + 1} из ${state.tasks.length}`}</span></div>
      <h2 class="task-title">${escapeHtml(task.title)}</h2>
      <div class="task-topic"><span class="topic-dot"></span>${escapeHtml(task.taskType || 'Тренировочное задание')} <span class="source-chip">${escapeHtml(statementType)}</span></div>
      <div class="task-statement">${renderMarkdown(task.statement)}</div>
      <div class="answer-box"><div class="answer-title-row"><label class="answer-title" for="answer-input">Твой ответ</label><span class="answer-hint">Введи число или краткий ответ</span></div>
        <form id="answer-form"><div class="answer-controls"><input id="answer-input" class="answer-input" type="text" autocomplete="off" inputmode="decimal" placeholder="Напиши ответ здесь…" value="${escapeHtml(answer)}" ${hasAnswer ? '' : 'disabled'} aria-describedby="answer-feedback"><button class="check-button" type="submit" ${hasAnswer ? '' : 'disabled'}>${answerButtonText} <span aria-hidden="true">→</span></button></div></form>
        <div class="feedback" id="answer-feedback" role="status" aria-live="polite"></div>
      </div>${taskActions}${solutionPanel}`;
    $('#answer-form')?.addEventListener('submit', checkAnswer);
    $('#open-fipi-task')?.addEventListener('click', () => openFipiForTask(Number(task.taskNumber)));
    $('#answer-input')?.addEventListener('input', (event) => {
      if (state.mode === 'exam') state.examAnswers[task.externalId] = event.target.value;
      else state.values[task.externalId] = event.target.value;
      saveProgress();
      if (state.mode === 'exam') renderTaskList();
    });
    $('#toggle-solution')?.addEventListener('click', () => {
      state.solutionOpen = !state.solutionOpen;
      renderCurrentTask();
      if (state.solutionOpen) $('#solution-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    $('#prev-task')?.addEventListener('click', () => {
      if (index > 0) selectTask(state.tasks[index - 1].externalId, { scroll: true });
    });
    $('#next-task')?.addEventListener('click', () => {
      if (state.mode === 'exam' && index >= state.tasks.length - 1) {
        requestFinishExam(false);
        return;
      }
      const nextIndex = index >= state.tasks.length - 1 ? 0 : index + 1;
      selectTask(state.tasks[nextIndex].externalId, { scroll: true });
    });
  }

  function checkAnswer(event) {
    event.preventDefault();
    const task = currentTask();
    const input = $('#answer-input');
    const feedback = $('#answer-feedback');
    if (!task || !input || !feedback) return;
    const userAnswer = input.value.trim();
    if (!userAnswer) {
      feedback.className = 'feedback visible warning';
      feedback.textContent = 'Сначала введи ответ — даже попытка приблизит к решению.';
      input.focus();
      return;
    }
    if (state.mode === 'exam') {
      state.examAnswers[task.externalId] = userAnswer;
      feedback.className = 'feedback visible correct';
      feedback.textContent = 'Ответ сохранён. Проверка будет после завершения пробного варианта.';
      saveProgress(); renderTaskList();
      return;
    }
    state.values[task.externalId] = userAnswer;
    state.attempts[task.externalId] = (state.attempts[task.externalId] || 0) + 1;
    if (task.correctAnswer === null || task.correctAnswer === undefined || String(task.correctAnswer).trim() === '') {
      feedback.className = 'feedback visible warning';
      feedback.textContent = 'Для этого демонстрационного шаблона правильный ответ пока не задан. Открой разбор, чтобы изучить алгоритм.';
      saveProgress();
      return;
    }
    if (answersMatch(userAnswer, task.correctAnswer)) {
      state.solved.add(task.externalId);
      feedback.className = 'feedback visible correct';
      feedback.textContent = 'Верно! Отличная работа — задание отмечено как решённое.';
      input.setAttribute('aria-invalid', 'false');
      saveProgress(); renderTaskList();
    } else {
      feedback.className = 'feedback visible incorrect';
      feedback.textContent = 'Пока не совпало. Проверь вычисления или открой разбор — он поможет найти шаг, где возникла ошибка.';
      input.setAttribute('aria-invalid', 'true');
      saveProgress();
    }
  }

  function fipiCandidates() {
    const topics = state.fipiLinks?.topics || {};
    return Object.entries(topics).flatMap(([number, info]) => (info.questionIds || []).map((qid) => ({
      taskNumber: Number(number), qid, title: info.title || `Задание ${number}`
    })));
  }

  function fipiQuestionUrl(qid) {
    const projectId = state.fipiLinks?.projectId || 'E040A72A1A3DABA14C90C97E0B6EE7DC8';
    return `https://ege.fipi.ru/bank/index.php?proj=${encodeURIComponent(projectId)}&qid=${encodeURIComponent(qid)}`;
  }

  function openTrustedExternalUrl(url) {
    // The only URLs passed here are built from the local FIPI configuration.
    const popup = window.open(url, '_blank');
    if (!popup) {
      toast('Браузер заблокировал новую вкладку. Разреши всплывающие окна и нажми кнопку ещё раз.');
      return false;
    }
    popup.opener = null;
    return true;
  }

  function openFipiForTask(taskNumber) {
    const info = state.fipiLinks?.topics?.[String(taskNumber)];
    const qids = info?.questionIds || [];
    if (qids.length) {
      const qid = qids[Math.floor(Math.random() * qids.length)];
      if (openTrustedExternalUrl(fipiQuestionUrl(qid))) {
        toast(`Открываю случайный пример ФИПИ по теме «${info.title}» из навигатора 2026 года.`);
      }
      return;
    }
    const url = state.fipiLinks?.bankUrl || 'https://ege.fipi.ru/bank/';
    if (openTrustedExternalUrl(url)) {
      toast(`Для задания №${taskNumber} нет прямой ссылки в навигаторе-примере. В открытом банке выбери нужный номер.`);
    }
  }

  function openRandomFipiTask() {
    const candidates = fipiCandidates();
    if (!candidates.length) {
      if (openTrustedExternalUrl(state.fipiLinks?.officialBankInfoUrl || 'https://fipi.ru/ege/otkrytyy-bank-zadaniy-ege')) {
        toast('Открываю официальный банк ФИПИ.');
      }
      return;
    }
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    if (openTrustedExternalUrl(fipiQuestionUrl(chosen.qid))) {
      toast(`Случайное задание ФИПИ №${chosen.taskNumber}: ${chosen.title}. Открылось на официальном сайте.`);
    }
  }

  function randomTasksByNumber() {
    const groups = new Map();
    for (const task of state.bankTasks) {
      const n = Number(task.taskNumber);
      if (!Number.isInteger(n) || n < 1 || n > 21) continue;
      if (!groups.has(n)) groups.set(n, []);
      groups.get(n).push(task);
    }
    const chosen = [];
    for (let n = 1; n <= 21; n++) {
      const group = groups.get(n) || [];
      if (!group.length) {
        toast(`В базе не найдено задание №${n}. Вариант пока не собран.`);
        return [];
      }
      chosen.push(group[Math.floor(Math.random() * group.length)]);
    }
    return chosen;
  }

  function confirmLeaveExam() {
    if (state.mode !== 'exam') return true;
    return window.confirm('Пробный вариант ещё идёт. Прервать попытку и вернуться к тренировке? Текущие ответы сохранятся в этом браузере.');
  }

  function setTaskCollection(tasks, mode, message) {
    if (!tasks.length) return;
    stopTimer();
    state.tasks = sortTasks(tasks);
    state.mode = mode;
    state.examEndAt = mode === 'exam' ? Date.now() + EXAM_SECONDS * 1000 : null;
    state.examAnswers = {};
    state.currentId = state.tasks[0].externalId;
    state.solutionOpen = false;
    el.search.value = '';
    el.typeFilter.value = 'all';
    updateModeUI();
    renderTaskList(); renderCurrentTask(); saveProgress();
    if (mode === 'exam') startTimer();
    if (message) toast(message);
    if (mode !== 'catalog') $('.practice-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function showAllTasks() {
    if (!confirmLeaveExam()) return;
    state.tasks = state.bankTasks;
    state.mode = 'catalog';
    state.examEndAt = null;
    state.currentId = state.bankTasks.some((task) => task.externalId === state.currentId) ? state.currentId : state.bankTasks[0].externalId;
    state.solutionOpen = false;
    el.search.value = ''; el.typeFilter.value = 'all';
    updateModeUI(); renderTaskList(); renderCurrentTask(); saveProgress();
    toast('Открыта вся база заданий.');
  }

  function startTopicPractice() {
    if (!confirmLeaveExam()) return;
    const chosenType = el.topicModeSelect?.value || '';
    if (!chosenType) {
      toast('Сначала выбери тип в разделе «Темы и варианты».');
      el.topicModeSelect?.focus();
      return;
    }
    const tasks = state.bankTasks.filter((task) => task.taskType === chosenType);
    if (!tasks.length) {
      toast('Для выбранного типа пока нет задач. Выбери другую тему.');
      return;
    }
    state.examAnswers = {};
    setTaskCollection(tasks, 'topic', `Отработка по типу «${chosenType}»: найдено ${tasks.length} авторских вариантов без таймера.`);
  }

  function startWarmup() {
    if (!confirmLeaveExam()) return;
    // First pick one random task for every exam number; then take five distinct numbers.
    const pool = randomTasksByNumber();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const tasks = pool.slice(0, Math.min(5, pool.length));
    if (!tasks.length) return;
    state.examAnswers = {};
    setTaskCollection(tasks, 'warmup', 'Готова короткая разминка: 5 случайных задач разных типов, без таймера.');
  }

  function startRandomCollection() {
    if (!confirmLeaveExam()) return;
    const tasks = randomTasksByNumber();
    if (tasks.length !== 21) return;
    state.examAnswers = {};
    setTaskCollection(tasks, 'collection', 'Готова смешанная авторская подборка: 21 задание разных типов, без таймера.');
  }

  function startTopicPracticeByNumber(taskNumber) {
    if (!confirmLeaveExam()) return;
    const tasks = state.bankTasks.filter((task) => Number(task.taskNumber) === Number(taskNumber));
    if (!tasks.length) {
      toast(`Для задания №${taskNumber} пока нет тренировочных вариантов.`);
      return;
    }
    if (el.topicModeSelect && tasks[0].taskType) el.topicModeSelect.value = tasks[0].taskType;
    state.examAnswers = {};
    setTaskCollection(tasks, 'topic', `Отработка задания №${taskNumber}: ${tasks.length} авторских вариантов без таймера.`);
  }

  function startExam() {
    if (state.mode === 'exam' && !window.confirm('Начать новый вариант? Текущая попытка будет завершена без подсчёта результата.')) return;
    const tasks = randomTasksByNumber();
    if (tasks.length !== 21) return;
    setTaskCollection(tasks, 'exam', 'Авторский пробный вариант ЕГЭ+ начат. У тебя 180 минут; ответы проверятся в конце.');
  }

  function stopTimer() {
    if (state.timerHandle) clearInterval(state.timerHandle);
    state.timerHandle = null;
  }

  function formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return [h,m,sec].map((v) => String(v).padStart(2,'0')).join(':');
  }

  function updateTimer() {
    if (state.mode !== 'exam' || !state.examEndAt) return;
    const remaining = Math.max(0, Math.ceil((state.examEndAt - Date.now()) / 1000));
    el.examTimer.textContent = formatTime(remaining);
    if (el.examTimerTrack) el.examTimerTrack.style.width = `${Math.min(100, remaining / EXAM_SECONDS * 100)}%`;
    if (el.examStatus) {
      el.examStatus.classList.toggle('timer-warning', remaining <= 600 && remaining > 60);
      el.examStatus.classList.toggle('timer-critical', remaining <= 60);
    }
    if (remaining <= 0) finishExam(true);
  }

  function startTimer() {
    stopTimer(); updateTimer();
    state.timerHandle = setInterval(updateTimer, 1000);
  }

  function requestFinishExam(timedOut) {
    if (state.mode !== 'exam') return;
    const unanswered = state.tasks.filter((task) => !String(state.examAnswers[task.externalId] ?? '').trim()).length;
    const prompt = timedOut
      ? 'Время вышло. Ответы будут проверены.'
      : `Завершить вариант сейчас? Без ответа осталось: ${unanswered}. После завершения правильные ответы будут показаны.`;
    if (timedOut || window.confirm(prompt)) finishExam(timedOut);
  }

  function finishExam(timedOut) {
    if (state.mode !== 'exam') return;
    stopTimer();
    const examTasks = [...state.tasks];
    const report = examTasks.map((task) => {
      const userAnswer = String(state.examAnswers[task.externalId] ?? '').trim();
      const correct = userAnswer !== '' && answersMatch(userAnswer, task.correctAnswer);
      if (correct) state.solved.add(task.externalId);
      return { task, userAnswer, correct };
    });
    const correctCount = report.filter((item) => item.correct).length;
    const answeredCount = report.filter((item) => item.userAnswer).length;
    const wrong = report.filter((item) => !item.correct);
    state.mode = 'catalog'; state.tasks = state.bankTasks; state.examEndAt = null; state.examAnswers = {};
    state.currentId = wrong.length ? wrong[0].task.externalId : state.bankTasks[0].externalId;
    state.solutionOpen = false;
    updateModeUI(); renderTaskList(); renderCurrentTask(); saveProgress();
    const title = timedOut ? 'Время вышло' : 'Авторский вариант ЕГЭ+ завершён';
    const mistakesHtml = wrong.length ? `<div class="exam-result-list"><h3>Задания для разбора</h3>${wrong.map(({task,userAnswer}) => `<button type="button" class="result-review-row" data-review-task-id="${escapeHtml(task.externalId)}"><span class="result-review-number">№${escapeHtml(task.taskNumber)}</span><span class="result-review-main"><strong>${escapeHtml(task.title)}</strong><small>Твой ответ: ${escapeHtml(userAnswer || 'нет ответа')} · Верный ответ: ${escapeHtml(task.correctAnswer)}</small></span><span class="result-review-action">Разобрать →</span></button>`).join('')}</div>` : '<div class="exam-perfect-note">Отличный результат! Все 21 ответа верны.</div>';
    el.examResultContent.innerHTML = `<div class="dialog-icon">${correctCount >= 15 ? '✓' : '∑'}</div><h2 id="exam-result-heading">${title}</h2><p class="exam-result-lead">Результат: <strong>${correctCount} из 21</strong>. Ответов заполнено: ${answeredCount}; без ответа: ${21-answeredCount}.</p><div class="exam-result-bar"><span style="width:${Math.round(correctCount/21*100)}%"></span></div><div class="exam-result-percent">${Math.round(correctCount/21*100)}% правильных ответов</div>${mistakesHtml}<div class="dialog-actions"><button class="secondary-button" id="exam-result-close" type="button">Вернуться к базе</button><button class="primary-button" id="exam-result-new" type="button">Новый вариант ↗</button></div>`;
    if (!el.examResultDialog.open) el.examResultDialog.showModal();
    toast(`Авторский пробный вариант: ${correctCount} из 21 верно.`);
  }

  function installEvents() {
    el.search.addEventListener('input', renderTaskList);
    el.typeFilter.addEventListener('change', renderTaskList);
    el.taskList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-task-id]');
      if (button) selectTask(button.dataset.taskId);
    });
    el.continueButton.addEventListener('click', () => {
      const currentIndex = state.tasks.findIndex((task) => task.externalId === state.currentId);
      const unsolved = state.tasks.find((task, index) => index >= Math.max(currentIndex, 0) && !state.solved.has(task.externalId))
        || state.tasks.find((task) => !state.solved.has(task.externalId));
      if (unsolved) selectTask(unsolved.externalId, { scroll: true });
      else { selectTask(state.tasks[0].externalId, { scroll: true }); toast('Все задания решены верно — можно пройти их ещё раз!'); }
    });
    el.allTasksButton?.addEventListener('click', showAllTasks);
    el.startTopicPracticeButton?.addEventListener('click', startTopicPractice);
    el.randomSetButton?.addEventListener('click', startRandomCollection);
    el.startWarmupButton?.addEventListener('click', startWarmup);
    document.addEventListener('click', (event) => {
      const topicButton = event.target.closest('[data-topic-number]');
      if (topicButton) startTopicPracticeByNumber(Number(topicButton.dataset.topicNumber));
    });
    document.querySelectorAll('.topnav .nav-link').forEach((link) => link.addEventListener('click', () => {
      document.querySelectorAll('.topnav .nav-link').forEach((item) => item.classList.toggle('active', item === link));
    }));
    el.randomFipiTaskButton?.addEventListener('click', openRandomFipiTask);
    el.startExamButton?.addEventListener('click', startExam);
    el.finishExamButton?.addEventListener('click', () => requestFinishExam(false));
    el.examResultDialog?.addEventListener('click', (event) => {
      const review = event.target.closest('[data-review-task-id]');
      if (review) {
        const id = review.dataset.reviewTaskId;
        el.examResultDialog.close();
        state.mode = 'catalog'; state.tasks = state.bankTasks; state.examEndAt = null;
        updateModeUI(); selectTask(id, { scroll: false });
        $('.practice-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (event.target.closest('#exam-result-close')) el.examResultDialog.close();
      if (event.target.closest('#exam-result-new')) { el.examResultDialog.close(); startExam(); }
    });
    el.resetProgress.addEventListener('click', () => el.resetDialog.showModal());
    el.resetDialog.addEventListener('close', () => {
      if (el.resetDialog.returnValue !== 'confirm') return;
      state.solved.clear(); state.attempts = {}; state.values = {};
      saveProgress(); renderTaskList(); renderCurrentTask(); toast('Прогресс сброшен. Можно начать заново.');
    });
  }

  async function init() {
    readProgress(); installEvents();
    try {
      const response = await fetch(DATA_URL, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      try {
        const fipiResponse = await fetch(FIPI_LINKS_URL, { cache: 'no-cache' });
        if (fipiResponse.ok) state.fipiLinks = await fipiResponse.json();
      } catch (_) { state.fipiLinks = null; }
      state.bankTasks = sortTasks(data.filter((task) => task.subjectId === 'math_basic'));
      if (!state.bankTasks.length) throw new Error('В локальной базе не найдены задания базовой математики.');
      const bankIds = new Set(state.bankTasks.map((task) => task.externalId));
      state.solved = new Set([...state.solved].filter((id) => bankIds.has(id)));
      state.tasks = state.bankTasks;
      if (state.restoreSession) {
        const restoredTasks = state.restoreSession.activeTaskIds.map((id) => state.bankTasks.find((task) => task.externalId === id)).filter(Boolean);
        if (restoredTasks.length && (state.restoreSession.mode !== 'exam' || restoredTasks.length === 21)) {
          state.tasks = sortTasks(restoredTasks);
          state.mode = ['exam', 'collection', 'topic', 'warmup'].includes(state.restoreSession.mode) ? state.restoreSession.mode : 'collection';
          state.examEndAt = state.mode === 'exam' ? state.restoreSession.examEndAt : null;
        }
      }
      if (!state.tasks.some((task) => task.externalId === state.currentId)) state.currentId = state.tasks[0].externalId;
      if (!state.tasks.length) state.tasks = state.bankTasks;
      populateFilters();
      renderTopicGroups();
      if (state.mode === 'topic' && el.topicModeSelect && state.tasks[0]?.taskType) el.topicModeSelect.value = state.tasks[0].taskType;
      updateModeUI(); renderTaskList(); renderCurrentTask(); saveProgress();
      if (state.mode === 'exam') {
        if (!state.examEndAt || state.examEndAt <= Date.now()) finishExam(true);
        else startTimer();
      }
      if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      }
    } catch (error) {
      el.taskContent.innerHTML = `<div class="empty-state"><strong>Не удалось загрузить задания</strong>${escapeHtml(error.message || 'Проверь, что сайт запущен через локальный сервер, а не открыт как файл.')}</div>`;
      el.taskList.innerHTML = '<div class="empty-state">База не загружена</div>';
    }
  }
  document.addEventListener('DOMContentLoaded', init);
})();

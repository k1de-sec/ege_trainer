(() => {
  'use strict';
  const DATA_URL = './tasks_data.json';
  const STORAGE_KEY = 'ege-trainer-progress-v1';
  const $ = (selector) => document.querySelector(selector);
  const el = {
    taskList: $('#task-list'), taskContent: $('#task-content'), search: $('#task-search'),
    typeFilter: $('#type-filter'), listCount: $('#list-count'), statTotal: $('#stat-total'),
    statDone: $('#stat-done'), statPercent: $('#stat-percent'), progressFraction: $('#progress-fraction'),
    progressBar: $('#progress-bar'), resetProgress: $('#reset-progress'), resetDialog: $('#reset-dialog'),
    confirmReset: $('#confirm-reset'), continueButton: $('#continue-button'), toast: $('#toast')
  };
  const state = { tasks: [], visible: [], currentId: null, solved: new Set(), attempts: {}, values: {}, solutionOpen: false, toastTimer: null };

  function readProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      state.solved = new Set(Array.isArray(saved.solved) ? saved.solved : []);
      state.attempts = saved.attempts && typeof saved.attempts === 'object' ? saved.attempts : {};
      state.values = saved.values && typeof saved.values === 'object' ? saved.values : {};
      state.currentId = typeof saved.currentId === 'string' ? saved.currentId : null;
    } catch (_) { /* Storage may be disabled; the app still works for this session. */ }
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        solved: [...state.solved], attempts: state.attempts, values: state.values, currentId: state.currentId
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

  function inlineMarkdown(value) {
    let text = escapeHtml(value);
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
    text = text.replace(/\\\((.+?)\\\)/g, '<span class="math-inline">$1</span>');
    text = text.replace(/\\\[(.+?)\\\]/g, '<span class="math-inline">$1</span>');
    return text;
  }

  function renderMarkdown(source) {
    const lines = String(source ?? '').replace(/\r/g, '').split('\n');
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

  function toast(message) {
    el.toast.textContent = message;
    el.toast.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2500);
  }

  function updateStats() {
    const total = state.tasks.length;
    const done = state.tasks.filter((task) => state.solved.has(task.externalId)).length;
    const percent = total ? Math.round(done / total * 100) : 0;
    el.statTotal.textContent = String(total);
    el.statDone.textContent = String(done);
    el.statPercent.textContent = `${percent}%`;
    el.progressFraction.textContent = `${done} / ${total}`;
    el.progressBar.style.width = `${percent}%`;
    const selected = state.tasks.find((task) => task.externalId === state.currentId);
    if (selected && selected.subjectId === 'math_basic') {
      const currentButton = document.querySelector('.task-item.selected');
      if (currentButton) currentButton.classList.toggle('done', state.solved.has(selected.externalId));
    }
  }

  function populateFilters() {
    const types = [...new Set(state.tasks.map((t) => t.taskType).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
    el.typeFilter.innerHTML = '<option value="all">Все темы</option>' + types.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join('');
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
      const done = state.solved.has(task.externalId);
      const selected = task.externalId === state.currentId;
      return `<button type="button" class="task-item${selected ? ' selected' : ''}${done ? ' done' : ''}" data-task-id="${escapeHtml(task.externalId)}" aria-current="${selected ? 'true' : 'false'}"><span class="task-number">${done ? '✓' : task.taskNumber}</span><span class="task-main"><span class="task-name">${escapeHtml(task.title)}</span><span class="task-meta">${escapeHtml(task.taskType || 'Тренировка')}</span></span>${done ? '<span class="task-done-mark" aria-label="Решено верно">✓</span>' : ''}</button>`;
    }).join('');
  }

  function selectTask(id, options = {}) {
    const task = state.tasks.find((item) => item.externalId === id);
    if (!task) return;
    state.currentId = task.externalId;
    state.solutionOpen = false;
    if (!options.silent) saveProgress();
    renderTaskList();
    renderCurrentTask();
    if (options.scroll) document.querySelector('.practice-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderCurrentTask() {
    const task = currentTask();
    if (!task) {
      el.taskContent.innerHTML = '<div class="empty-state"><strong>Пока нет заданий</strong>Проверьте файл базы данных и обновите страницу.</div>';
      return;
    }
    const index = state.tasks.findIndex((t) => t.externalId === task.externalId);
    const solved = state.solved.has(task.externalId);
    const answer = state.values[task.externalId] ?? '';
    const hasAnswer = task.correctAnswer !== null && task.correctAnswer !== undefined && String(task.correctAnswer).trim() !== '';
    const mistakes = Array.isArray(task.commonMistakes) ? task.commonMistakes : [];
    const explanation = task.explanation || 'Для этого задания пока не добавлен разбор.';
    el.taskContent.innerHTML = `
      <div class="task-top"><div class="task-breadcrumb">Математика (база) <span>›</span> <b>Задание ${escapeHtml(task.taskNumber)}</b></div><span class="task-status${solved ? ' done' : ''}">${solved ? '✓ Решено верно' : `Задание ${index + 1} из ${state.tasks.length}`}</span></div>
      <h2 class="task-title">${escapeHtml(task.title)}</h2>
      <div class="task-topic"><span class="topic-dot"></span>${escapeHtml(task.taskType || 'Тренировочное задание')}</div>
      <div class="task-statement">${renderMarkdown(task.statement)}</div>
      <div class="answer-box"><div class="answer-title-row"><label class="answer-title" for="answer-input">Твой ответ</label><span class="answer-hint">Введи число или краткий ответ</span></div>
        <form id="answer-form"><div class="answer-controls"><input id="answer-input" class="answer-input" type="text" autocomplete="off" inputmode="decimal" placeholder="Напиши ответ здесь…" value="${escapeHtml(answer)}" ${hasAnswer ? '' : 'disabled'} aria-describedby="answer-feedback"><button class="check-button" type="submit" ${hasAnswer ? '' : 'disabled'}>Проверить ответ <span aria-hidden="true">→</span></button></div></form>
        <div class="feedback" id="answer-feedback" role="status" aria-live="polite"></div>
      </div>
      <div class="task-actions"><button class="link-button" id="toggle-solution" type="button"><span aria-hidden="true">${state.solutionOpen ? '⌃' : '⊕'}</span>${state.solutionOpen ? 'Скрыть разбор' : 'Посмотреть разбор'}</button><div class="nav-buttons"><button class="secondary-button" id="prev-task" type="button" ${index <= 0 ? 'disabled' : ''}>← Назад</button><button class="next-button" id="next-task" type="button">${index >= state.tasks.length - 1 ? 'К началу' : 'Следующее'} →</button></div></div>
      <section class="solution-panel${state.solutionOpen ? ' open' : ''}" id="solution-panel" aria-label="Разбор решения"><div class="solution-header"><span class="solution-badge">ƒx</span><h3>Разбор решения</h3></div><div class="solution-body">${renderMarkdown(explanation)}</div>
      ${hasAnswer ? `<div class="answer-reveal"><span>Правильный ответ</span><strong>${escapeHtml(task.correctAnswer)}</strong></div>` : '<div class="answer-reveal"><span>Ответ для этого шаблона ещё не задан</span></div>'}
      ${mistakes.length ? `<div class="mistakes"><div class="mistakes-title">На что обратить внимание</div><ul>${mistakes.map((mistake) => `<li>${escapeHtml(mistake)}</li>`).join('')}</ul></div>` : ''}</section>`;
    $('#answer-form')?.addEventListener('submit', checkAnswer);
    $('#answer-input')?.addEventListener('input', (event) => {
      state.values[task.externalId] = event.target.value;
      saveProgress();
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
      state.tasks = data.filter((task) => task.subjectId === 'math_basic').sort((a, b) => a.taskNumber - b.taskNumber);
      if (!state.tasks.length) throw new Error('В локальной базе не найдены задания базовой математики.');
      const saved = state.tasks.find((task) => task.externalId === state.currentId);
      if (!saved) state.currentId = state.tasks[0].externalId;
      state.solved = new Set([...state.solved].filter((id) => state.tasks.some((task) => task.externalId === id)));
      populateFilters(); renderTaskList(); renderCurrentTask(); saveProgress();
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

(() => {
  'use strict';
  const DATA_URL = './tasks_data.json';
  const FIPI_LINKS_URL = './fipi_links.json';
  const PAGE = document.body.dataset.page || 'home';
  const ACTIVE_SUBJECT_KEY = window.EGE_ACTIVE_SUBJECT_ID || 'math_basic';
  // The legacy task UI only owns base-math pages. Other subjects are rendered by multi-exam.js;
  // let it handle their practice banks instead of loading base-math tasks into hidden controls.
  if (ACTIVE_SUBJECT_KEY !== 'math_basic') return;
  const STORAGE_KEY = `ege-trainer-progress-v3-${ACTIVE_SUBJECT_KEY}`;
  const EXAM_SECONDS = 180 * 60;
  const $ = (selector) => document.querySelector(selector);
  const el = {
    taskList: $('#task-list'), taskContent: $('#task-content'), search: $('#task-search'),
    typeFilter: $('#type-filter'), topicModeSelect: $('#topic-mode-select'), topicGroupGrid: $('#topic-group-grid'),
    startTopicPracticeButton: $('#start-topic-practice-button'), listCount: $('#list-count'), statTotal: $('#stat-total'),
    statDone: $('#stat-done'), statPercent: $('#stat-percent'), progressFraction: $('#progress-fraction'),
    progressBar: $('#progress-bar'), resetProgress: $('#reset-progress'), resetDialog: $('#reset-dialog'),
    imageLightbox: $('#image-lightbox'), lightboxImage: $('#lightbox-image'), lightboxCaption: $('#lightbox-caption'),
    lightboxZoomValue: $('#lightbox-zoom-value'), lightboxStage: $('#lightbox-stage'),
    confirmReset: $('#confirm-reset'), toast: $('#toast'),
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
    solved: new Set(), selfChecked: new Set(), attempts: {}, values: {}, solutionOpen: false, graphViews: {}, lightboxScale: 1,
    toastTimer: null, mode: 'catalog', examEndAt: null,
    examAnswers: {}, timerHandle: null, restoreSession: null, fipiLinks: null
  };

  function readProgress() {
    try {
      const legacyProgress = ACTIVE_SUBJECT_KEY === 'math_basic' ? (localStorage.getItem('ege-trainer-progress-v2') || localStorage.getItem('ege-trainer-progress-v1')) : null;
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || legacyProgress || '{}');
      state.solved = new Set(Array.isArray(saved.solved) ? saved.solved : []);
      state.selfChecked = new Set(Array.isArray(saved.selfChecked) ? saved.selfChecked : []);
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
        solved: [...state.solved], selfChecked: [...state.selfChecked], attempts: state.attempts, values: state.values,
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

  // A restricted mathematical-expression parser. User input is tokenized and parsed;
  // it is never passed to eval()/Function(), so expressions cannot execute JavaScript.
  function compileMathExpression(source) {
    const raw = String(source ?? '').trim()
      .replace(/^(?:f\s*\(\s*x\s*\)|y)\s*=/i, '')
      .replace(/[−–—]/g, '-')
      .replace(/,/g, '.');
    const tokens = raw.match(/(?:\d+(?:\.\d*)?|\.\d+)|(?:[a-zA-Z]+)|[()+\-*/^,]/g) || [];
    if (!tokens.length || tokens.join('') !== raw.replace(/\s+/g, '')) throw new Error('Недопустимое выражение');
    let pos = 0;
    const peek = () => tokens[pos];
    const take = () => tokens[pos++];
    const parsePrimary = () => {
      const token = take();
      if (token === undefined) throw new Error('Неожиданный конец выражения');
      if (token === '(') {
        const fn = parseAdd();
        if (take() !== ')') throw new Error('Не закрыта скобка');
        return fn;
      }
      if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) {
        const n = Number(token);
        return () => n;
      }
      if (/^[a-zA-Z]+$/.test(token)) {
        const name = token.toLowerCase();
        if (name === 'x') return (x) => x;
        if (name === 'pi') return () => Math.PI;
        if (name === 'e') return () => Math.E;
        const funcs = {
          sin: Math.sin, cos: Math.cos, tan: Math.tan, sqrt: Math.sqrt,
          abs: Math.abs, ln: Math.log, log: (v) => Math.log10(v), exp: Math.exp
        };
        if (!Object.prototype.hasOwnProperty.call(funcs, name) || take() !== '(') throw new Error('Неизвестная функция');
        const args = [parseAdd()];
        while (peek() === ',') { take(); args.push(parseAdd()); }
        if (take() !== ')') throw new Error('Не закрыта скобка функции');
        return (x) => funcs[name](...args.map((fn) => fn(x)));
      }
      throw new Error('Неожиданный символ');
    };
    const parsePower = () => {
      const left = parsePrimary();
      if (peek() === '^') { take(); const right = parseUnary(); return (x) => Math.pow(left(x), right(x)); }
      return left;
    };
    const parseUnary = () => {
      if (peek() === '+') { take(); return parseUnary(); }
      if (peek() === '-') { take(); const inner = parseUnary(); return (x) => -inner(x); }
      return parsePower();
    };
    const parseMul = () => {
      let fn = parseUnary();
      while (peek() === '*' || peek() === '/') {
        const op = take(), right = parseUnary(), left = fn;
        fn = op === '*' ? (x) => left(x) * right(x) : (x) => left(x) / right(x);
      }
      return fn;
    };
    const parseAdd = () => {
      let fn = parseMul();
      while (peek() === '+' || peek() === '-') {
        const op = take(), right = parseMul(), left = fn;
        fn = op === '+' ? (x) => left(x) + right(x) : (x) => left(x) - right(x);
      }
      return fn;
    };
    const compiled = parseAdd();
    if (pos !== tokens.length) throw new Error('Лишние символы в выражении');
    return compiled;
  }

  function expressionsEquivalent(userAnswer, correctAnswer) {
    try {
      const user = compileMathExpression(userAnswer);
      const correct = compileMathExpression(correctAnswer);
      const hasX = /\bx\b/i.test(String(userAnswer)) || /\bx\b/i.test(String(correctAnswer));
      const points = hasX ? [-3.17, -1.31, -0.29, 0.43, 1.79, 3.61] : [0];
      let compared = 0;
      for (const x of points) {
        const a = user(x), b = correct(x);
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
        compared++;
        if (Math.abs(a - b) > 1e-7 * Math.max(1, Math.abs(a), Math.abs(b))) return false;
      }
      return compared >= (hasX ? 4 : 1);
    } catch (_) { return false; }
  }

  function isLongTextTask(task) { return task?.answerSchema?.type === 'long-text'; }
  function isAutoGradableTask(task) {
    if (!task || isLongTextTask(task)) return false;
    if (task.answerSchema?.type === 'fields') return Array.isArray(task.answerSchema.fields) && task.answerSchema.fields.length > 0 && task.answerSchema.fields.every((field) => String(field.correctAnswer ?? '').trim() !== '');
    if (task.answerSchema?.type === 'multi-choice') return Array.isArray(task.answerSchema.correctAnswers) && task.answerSchema.correctAnswers.length > 0;
    return task.correctAnswer !== null && task.correctAnswer !== undefined && String(task.correctAnswer).trim() !== '';
  }

  function answerHasContent(answer) {
    if (Array.isArray(answer)) return answer.length > 0;
    if (answer && typeof answer === 'object') return Object.values(answer).some((value) => String(value ?? '').trim() !== '');
    return String(answer ?? '').trim() !== '';
  }

  function answersMatchTask(task, userAnswer) {
    if (!isAutoGradableTask(task)) return null;
    const schema = task.answerSchema || {};
    if (schema.type === 'fields') {
      if (!userAnswer || typeof userAnswer !== 'object' || Array.isArray(userAnswer)) return false;
      return schema.fields.every((field) => {
        const value = userAnswer[field.key];
        if (!String(value ?? '').trim()) return false;
        return answersMatch(value, field.correctAnswer) || (field.aliases || []).some((alias) => answersMatch(value, alias));
      });
    }
    if (schema.type === 'multi-choice') {
      if (!Array.isArray(userAnswer)) return false;
      const given = [...new Set(userAnswer.map((v) => String(v)))].sort();
      const expected = [...new Set(schema.correctAnswers.map((v) => String(v)))].sort();
      return given.length === expected.length && given.every((value, index) => value === expected[index]);
    }
    if (schema.type === 'choice') return String(userAnswer ?? '') === String(task.correctAnswer);
    if (schema.type === 'expression') return expressionsEquivalent(userAnswer, task.correctAnswer);
    return answersMatch(userAnswer, task.correctAnswer);
  }

  function getTaskAnswer(task, isExam) {
    return isExam ? (state.examAnswers[task.externalId] ?? (task.answerSchema?.type === 'fields' ? {} : task.answerSchema?.type === 'multi-choice' ? [] : ''))
      : (state.values[task.externalId] ?? (task.answerSchema?.type === 'fields' ? {} : task.answerSchema?.type === 'multi-choice' ? [] : ''));
  }

  function renderAnswerControls(task, answer, isExam, answerButtonText) {
    const schema = task.answerSchema || {};
    const disabled = isAutoGradableTask(task) || isLongTextTask(task) ? '' : 'disabled';
    if (schema.type === 'fields') {
      const values = answer && typeof answer === 'object' && !Array.isArray(answer) ? answer : {};
      return `<div class="structured-answer-fields">${schema.fields.map((field) => `<label class="structured-answer-field"><span>${escapeHtml(field.label || field.key)}</span><input class="answer-input" type="text" inputmode="decimal" data-answer-key="${escapeHtml(field.key)}" autocomplete="off" placeholder="${escapeHtml(field.placeholder || 'Ответ')}" value="${escapeHtml(values[field.key] ?? '')}" ${disabled} /></label>`).join('')}</div><button class="check-button" type="submit" ${disabled}>${answerButtonText} <span aria-hidden="true">→</span></button>`;
    }
    if (schema.type === 'choice' || schema.type === 'multi-choice') {
      const values = schema.type === 'multi-choice' ? (Array.isArray(answer) ? answer.map(String) : []) : [String(answer ?? '')];
      const inputType = schema.type === 'multi-choice' ? 'checkbox' : 'radio';
      return `<fieldset class="answer-choice-fieldset" ${disabled}><legend>${escapeHtml(schema.prompt || 'Выбери ответ')}</legend><div class="answer-choice-grid">${(schema.options || []).map((option) => `<label class="answer-choice-option"><input type="${inputType}" name="task-choice" data-choice-value="${escapeHtml(option.value)}" value="${escapeHtml(option.value)}" ${values.includes(String(option.value)) ? 'checked' : ''} ${disabled}/><span class="choice-marker">${inputType === 'radio' ? '○' : '✓'}</span><span>${escapeHtml(option.label)}</span></label>`).join('')}</div></fieldset><button class="check-button" type="submit" ${disabled}>${answerButtonText} <span aria-hidden="true">→</span></button>`;
    }
    if (schema.type === 'long-text') {
      return `<textarea id="answer-input" class="answer-input answer-long-text" rows="${Math.max(4, Math.min(10, Number(schema.rows) || 5))}" placeholder="${escapeHtml(schema.placeholder || 'Запиши ход решения…')}" maxlength="10000">${escapeHtml(answer ?? '')}</textarea><button class="check-button" type="submit">${answerButtonText} <span aria-hidden="true">→</span></button>`;
    }
    const expression = schema.type === 'expression';
    return `<input id="answer-input" class="answer-input" type="text" autocomplete="off" inputmode="${expression ? 'text' : 'decimal'}" placeholder="${escapeHtml(expression ? 'Например: 2^3 / 4' : 'Напиши ответ здесь…')}" value="${escapeHtml(answer ?? '')}" ${disabled} aria-describedby="answer-feedback"><button class="check-button" type="submit" ${disabled}>${answerButtonText} <span aria-hidden="true">→</span></button>`;
  }

  function captureAnswerFromControls(task) {
    const schema = task.answerSchema || {};
    if (schema.type === 'fields') {
      return Object.fromEntries(schema.fields.map((field) => [field.key, $(`[data-answer-key="${CSS.escape(field.key)}"]`)?.value || '']));
    }
    if (schema.type === 'multi-choice') return [...document.querySelectorAll('[data-choice-value]:checked')].map((input) => input.value);
    if (schema.type === 'choice') return document.querySelector('[data-choice-value]:checked')?.value || '';
    return $('#answer-input')?.value ?? '';
  }

  function formatExpectedAnswer(task) {
    const schema = task.answerSchema || {};
    if (schema.type === 'fields') return schema.fields.map((field) => `${field.label || field.key}: ${field.correctAnswer}`).join(' · ') + (task.correctAnswer ? ` (${task.correctAnswer})` : '');
    if (schema.type === 'multi-choice') {
      const labels = schema.options.filter((option) => schema.correctAnswers.map(String).includes(String(option.value))).map((option) => option.label);
      return `${task.correctAnswer || ''}${labels.length ? ` — ${labels.join('; ')}` : ''}`;
    }
    if (schema.type === 'choice') return schema.options.find((option) => String(option.value) === String(task.correctAnswer))?.label || String(task.correctAnswer ?? '');
    if (isLongTextTask(task)) return 'Сверь ход решения с критериями ниже';
    return String(task.correctAnswer ?? '');
  }

  function renderTaskVisuals(task) {
    const parts = [];
    const visual = task.visual;
    if (visual?.type === 'function-graph') {
      const id = task.externalId.replace(/[^a-zA-Z0-9_-]/g, '-');
      parts.push(`<section class="task-visual graph-visual" data-graph-id="${escapeHtml(task.externalId)}" aria-label="Интерактивный график"><div class="task-visual-heading"><strong>${escapeHtml(visual.title || 'Интерактивный график')}</strong><span>Масштаб и перемещение</span></div><div class="graph-toolbar" aria-label="Управление графиком"><button type="button" data-graph-action="zoom-out" aria-label="Уменьшить масштаб">−</button><button type="button" data-graph-action="zoom-in" aria-label="Увеличить масштаб">+</button><span class="graph-toolbar-hint">Колесо мыши — масштаб</span><span class="graph-toolbar-spacer"></span><button type="button" data-graph-action="left" aria-label="Сдвинуть влево">←</button><button type="button" data-graph-action="up" aria-label="Сдвинуть вверх">↑</button><button type="button" data-graph-action="down" aria-label="Сдвинуть вниз">↓</button><button type="button" data-graph-action="right" aria-label="Сдвинуть вправо">→</button><button type="button" data-graph-action="reset" aria-label="Сбросить масштаб">Сброс</button></div><div class="graph-svg-host" id="graph-svg-${id}">${renderGraphSvg(task)}</div><div class="graph-legend">${(visual.functions || []).map((fn, index) => `<span><i style="background:${graphColor(fn.color, index)}"></i>${escapeHtml(fn.label || fn.expression)}</span>`).join('')}</div><p class="visual-caption">${escapeHtml(visual.caption || 'График построен для авторского задания. Используй масштабирование, чтобы рассмотреть детали.')}</p></section>`);
    }
    for (const media of (Array.isArray(task.media) ? task.media : [])) {
      if (media.type !== 'image' || !media.src) continue;
      parts.push(`<figure class="task-visual task-media"><button class="zoomable-image-button" type="button" data-zoom-image="${escapeHtml(media.src)}" data-image-alt="${escapeHtml(media.alt || task.title)}" data-image-caption="${escapeHtml(media.caption || '')}" aria-label="Увеличить изображение: ${escapeHtml(media.alt || task.title)}"><img src="${escapeHtml(media.src)}" alt="${escapeHtml(media.alt || task.title)}" loading="lazy"/><span class="image-zoom-indicator">⌕ Нажми, чтобы увеличить</span></button>${media.caption ? `<figcaption>${escapeHtml(media.caption)}</figcaption>` : ''}</figure>`);
    }
    return parts.join('');
  }

  function graphColor(color, index = 0) {
    const colors = { purple: '#6857e8', orange: '#e58a42', green: '#18a37a', blue: '#397ed1', red: '#df5d53' };
    return colors[color] || ['#6857e8', '#e58a42', '#18a37a'][index % 3];
  }

  function niceGraphStep(span) {
    const raw = Math.max(span / 8, 0.0001);
    const power = Math.pow(10, Math.floor(Math.log10(raw)));
    const normalized = raw / power;
    const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return nice * power;
  }

  function renderGraphSvg(task) {
    const visual = task.visual || {};
    const base = { xMin: Number(visual.xMin ?? -5), xMax: Number(visual.xMax ?? 5), yMin: Number(visual.yMin ?? -5), yMax: Number(visual.yMax ?? 5) };
    const view = state.graphViews[task.externalId] || { ...base };
    const xMin = view.xMin, xMax = view.xMax, yMin = view.yMin, yMax = view.yMax;
    const W = 720, H = 410, L = 48, R = 18, T = 18, B = 38, PW = W - L - R, PH = H - T - B;
    const sx = (x) => L + (x - xMin) / (xMax - xMin) * PW;
    const sy = (y) => T + (yMax - y) / (yMax - yMin) * PH;
    const fx = niceGraphStep(xMax - xMin), fy = niceGraphStep(yMax - yMin);
    const clipId = `clip-${task.externalId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    let grid = '';
    const xStart = Math.ceil(xMin / fx) * fx;
    for (let x = xStart, count = 0; x <= xMax + fx * 0.001 && count < 120; x += fx, count++) {
      const px = sx(x);
      grid += `<line class="graph-grid-line" x1="${px}" y1="${T}" x2="${px}" y2="${T + PH}"/><text class="graph-tick-label" x="${px}" y="${H - 14}" text-anchor="middle">${Number(x.toPrecision(4))}</text>`;
    }
    const yStart = Math.ceil(yMin / fy) * fy;
    for (let y = yStart, count = 0; y <= yMax + fy * 0.001 && count < 120; y += fy, count++) {
      const py = sy(y);
      grid += `<line class="graph-grid-line" x1="${L}" y1="${py}" x2="${L + PW}" y2="${py}"/><text class="graph-tick-label" x="${L - 8}" y="${py + 4}" text-anchor="end">${Number(y.toPrecision(4))}</text>`;
    }
    if (xMin <= 0 && xMax >= 0) grid += `<line class="graph-axis-line" x1="${sx(0)}" y1="${T}" x2="${sx(0)}" y2="${T + PH}"/>`;
    if (yMin <= 0 && yMax >= 0) grid += `<line class="graph-axis-line" x1="${L}" y1="${sy(0)}" x2="${L + PW}" y2="${sy(0)}"/>`;
    let curves = '';
    for (const [index, fn] of (visual.functions || []).entries()) {
      try {
        const evaluator = compileMathExpression(fn.expression);
        let d = '', drawing = false;
        const samples = 420;
        for (let i = 0; i <= samples; i++) {
          const x = xMin + (xMax - xMin) * i / samples;
          const y = evaluator(x);
          if (!Number.isFinite(y) || y < yMin - (yMax - yMin) * 3 || y > yMax + (yMax - yMin) * 3) { drawing = false; continue; }
          const command = drawing ? 'L' : 'M';
          d += `${command}${sx(x).toFixed(2)},${sy(y).toFixed(2)} `;
          drawing = true;
        }
        curves += `<path class="graph-curve" d="${d}" stroke="${graphColor(fn.color, index)}"/>`;
      } catch (_) { /* Ignore an invalid optional function instead of breaking the task page. */ }
    }
    return `<svg class="interactive-function-graph" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(visual.title || 'График функции')}" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="${clipId}"><rect x="${L}" y="${T}" width="${PW}" height="${PH}"/></clipPath></defs><rect class="graph-plot-background" x="${L}" y="${T}" width="${PW}" height="${PH}" rx="8"/>${grid}<g clip-path="url(#${clipId})">${curves}</g><text class="graph-axis-label" x="${W - 14}" y="${(yMin <= 0 && yMax >= 0) ? sy(0) - 9 : H - B + 17}" text-anchor="end">x</text><text class="graph-axis-label" x="${(xMin <= 0 && xMax >= 0) ? sx(0) + 9 : L + 10}" y="${T + 12}">y</text></svg>`;
  }

  function zoomGraph(task, action) {
    const visual = task.visual || {};
    const defaults = { xMin: Number(visual.xMin ?? -5), xMax: Number(visual.xMax ?? 5), yMin: Number(visual.yMin ?? -5), yMax: Number(visual.yMax ?? 5) };
    const view = state.graphViews[task.externalId] || { ...defaults };
    if (action === 'reset') state.graphViews[task.externalId] = { ...defaults };
    else {
      const centerX = (view.xMin + view.xMax) / 2, centerY = (view.yMin + view.yMax) / 2;
      const spanX = view.xMax - view.xMin, spanY = view.yMax - view.yMin;
      if (action === 'zoom-in' || action === 'zoom-out') {
        const factor = action === 'zoom-in' ? 0.78 : 1.28;
        const nextX = Math.min(1e6, Math.max(0.02, spanX * factor));
        const nextY = Math.min(1e6, Math.max(0.02, spanY * factor));
        state.graphViews[task.externalId] = { xMin: centerX - nextX / 2, xMax: centerX + nextX / 2, yMin: centerY - nextY / 2, yMax: centerY + nextY / 2 };
      } else {
        const dx = spanX * 0.15 * (action === 'left' ? -1 : action === 'right' ? 1 : 0);
        const dy = spanY * 0.15 * (action === 'up' ? 1 : action === 'down' ? -1 : 0);
        state.graphViews[task.externalId] = { xMin: view.xMin + dx, xMax: view.xMax + dx, yMin: view.yMin + dy, yMax: view.yMax + dy };
      }
    }
    const host = $(`[data-graph-id="${CSS.escape(task.externalId)}"] .graph-svg-host`);
    if (host) host.innerHTML = renderGraphSvg(task);
  }

  function openImageLightbox(src, alt, caption) {
    if (!el.imageLightbox || !el.lightboxImage || !src) return;
    el.lightboxImage.src = src; el.lightboxImage.alt = alt || 'Увеличенное изображение';
    if (el.lightboxCaption) el.lightboxCaption.textContent = caption || alt || '';
    state.lightboxScale = 1; updateLightboxZoom();
    if (!el.imageLightbox.open) el.imageLightbox.showModal();
  }

  function updateLightboxZoom() {
    if (!el.lightboxImage) return;
    state.lightboxScale = Math.max(0.5, Math.min(4, state.lightboxScale));
    el.lightboxImage.style.transform = `scale(${state.lightboxScale})`;
    if (el.lightboxZoomValue) el.lightboxZoomValue.textContent = `${Math.round(state.lightboxScale * 100)}%`;
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
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => el.toast?.classList.remove('show'), 2800);
  }

  function updateStats() {
    const total = state.tasks.length;
    const isExam = state.mode === 'exam';
    const done = isExam
      ? state.tasks.filter((task) => answerHasContent(state.examAnswers[task.externalId])).length
      : state.tasks.filter((task) => state.solved.has(task.externalId)).length;
    const percent = total ? Math.round(done / total * 100) : 0;
    if (el.statTotal) el.statTotal.textContent = String(total);
    if (el.statDone) el.statDone.textContent = String(done);
    if (el.statPercent) el.statPercent.textContent = `${percent}%`;
    if (el.progressFraction) el.progressFraction.textContent = `${done} / ${total}`;
    if (el.progressBar) el.progressBar.style.width = `${percent}%`;
    if (el.statTotalLabel) el.statTotalLabel.textContent = state.mode === 'catalog' ? 'авторских упражнений' : state.mode === 'exam' ? 'упражнений в пробнике' : state.mode === 'topic' ? 'упражнений по типу' : state.mode === 'warmup' ? 'упражнений в разминке' : state.mode === 'review' ? 'заданий для разбора' : 'упражнений в подборке';
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
    if (el.typeFilter) el.typeFilter.innerHTML = '<option value="all">Все темы</option>' + types.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join('');
    if (el.topicModeSelect) {
      el.topicModeSelect.innerHTML = '<option value="">Выбери тип задания</option>' + types.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join('');
    }
  }

  function renderTaskList() {
    // Only pages that contain a task browser render a list. Other pages stay truly separate.
    if (!el.search || !el.typeFilter || !el.listCount || !el.taskList) return;
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
      const answered = state.mode === 'exam' && answerHasContent(state.examAnswers[task.externalId]);
      const selected = task.externalId === state.currentId;
      const numberLabel = answered ? '•' : done ? '✓' : task.taskNumber;
      return `<button type="button" class="task-item${selected ? ' selected' : ''}${done ? ' done' : ''}${answered ? ' answered' : ''}" data-task-id="${escapeHtml(task.externalId)}" aria-current="${selected ? 'true' : 'false'}"><span class="task-number">${numberLabel}</span><span class="task-main"><span class="task-name">${escapeHtml(task.title)}</span><span class="task-meta">${escapeHtml(task.taskType || 'Тренировка')}</span></span>${done ? '<span class="task-done-mark" aria-label="Решено верно">✓</span>' : answered ? '<span class="task-done-mark" aria-label="Ответ сохранён">•</span>' : ''}</button>`;
    }).join('');
    updateStats();
  }

  function updateModeUI() {
    const isExam = state.mode === 'exam';
    document.body.classList.toggle('is-exam-mode', isExam);
    document.body.classList.toggle('has-active-session', state.mode !== 'catalog');
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
              ? 'Короткая разминка: 5 случайных авторских упражнений из разных типов, без таймера.'
              : state.mode === 'review'
                ? 'Разбор ошибки после пробного варианта. Это авторское упражнение; официальный оригинал открывается отдельно.'
                : `Локально: ${state.bankTasks.length} авторских упражнений, по ${Math.floor(state.bankTasks.length / 21)} на каждый номер. Это не оригинальные задания ФИПИ; официальные условия открываются отдельно.`;
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
    // A content panel exists only on topics and self-study pages.
    if (!el.taskContent) return;
    const task = currentTask();
    if (!task) {
      el.taskContent.innerHTML = '<div class="empty-state"><strong>Пока нет заданий</strong>Проверь файл базы данных и обнови страницу.</div>';
      return;
    }
    const index = state.tasks.findIndex((item) => item.externalId === task.externalId);
    const isExam = state.mode === 'exam';
    const solved = state.solved.has(task.externalId);
    const answer = getTaskAnswer(task, isExam);
    const hasAnswer = isAutoGradableTask(task) || isLongTextTask(task);
    const mistakes = Array.isArray(task.commonMistakes) ? task.commonMistakes : [];
    const explanation = task.explanation || 'Для этого задания пока не добавлен разбор.';
    const statementType = task.sourceType === 'official_fipi' ? 'Оригинальное задание ФИПИ' : 'Авторское упражнение · не ФИПИ';
    const fipiTopicInfo = state.fipiLinks?.topics?.[String(task.taskNumber)];
    const fipiTaskButtonText = fipiTopicInfo?.questionIds?.length ? 'Открыть оригинальные примеры ФИПИ ↗' : 'Открыть банк ФИПИ ↗';
    const answerButtonText = isExam ? 'Сохранить ответ' : isLongTextTask(task) ? 'Сохранить решение' : 'Проверить ответ';
    const taskActions = isExam
      ? `<div class="task-actions"><span class="exam-answer-note">Вариант проверится после завершения. Ответы сохраняются автоматически.</span><div class="nav-buttons"><button class="secondary-button" id="prev-task" type="button" ${index <= 0 ? 'disabled' : ''}>← Назад</button><button class="next-button" id="next-task" type="button">${index >= state.tasks.length - 1 ? 'Завершить вариант' : 'Следующее'} →</button></div></div>`
      : `<div class="task-actions task-actions-with-source"><div class="task-action-links"><button class="link-button" id="toggle-solution" type="button"><span aria-hidden="true">${state.solutionOpen ? '⌃' : '⊕'}</span>${state.solutionOpen ? 'Скрыть разбор' : 'Посмотреть разбор'}</button><button class="link-button fipi-task-link" id="open-fipi-task" type="button">${fipiTaskButtonText}</button></div><div class="nav-buttons"><button class="secondary-button" id="prev-task" type="button" ${index <= 0 ? 'disabled' : ''}>← Назад</button><button class="next-button" id="next-task" type="button">${index >= state.tasks.length - 1 ? 'К началу' : 'Следующее'} →</button></div></div>`;
    const selfCheckButton = isLongTextTask(task) ? `<button type="button" id="mark-self-checked" class="self-check-button">✓ Я сверил ответ с критериями</button>` : '';
    const solutionValue = isLongTextTask(task)
      ? '<strong>Автоматическая оценка здесь не применяется.</strong> Сверь свой ход решения с критериями и разбором, затем отметь самопроверку.'
      : escapeHtml(formatExpectedAnswer(task));
    const solutionPanel = isExam ? '' : `<section class="solution-panel${state.solutionOpen ? ' open' : ''}" id="solution-panel" aria-label="Разбор решения"><div class="solution-header"><span class="solution-badge">ƒx</span><h3>Разбор решения</h3></div><div class="solution-body">${renderMarkdown(explanation)}</div>${isLongTextTask(task) && task.answerSchema?.rubric?.length ? `<div class="answer-rubric"><strong>Критерии самопроверки</strong><ul>${task.answerSchema.rubric.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : ''}<div class="answer-reveal"><span>${isLongTextTask(task) ? 'Как оценивать себя' : 'Правильный ответ'}</span><strong>${solutionValue}</strong></div>${selfCheckButton}${mistakes.length ? `<div class="mistakes"><div class="mistakes-title">На что обратить внимание</div><ul>${mistakes.map((mistake) => `<li>${escapeHtml(mistake)}</li>`).join('')}</ul></div>` : ''}</section>`;
    const formatNote = task.answerSchema?.type === 'fields' ? 'Заполни все поля' : task.answerSchema?.type === 'multi-choice' ? 'Можно выбрать несколько вариантов' : task.answerSchema?.type === 'expression' ? 'Можно вводить вычисляемое выражение; например 2^3/4' : isLongTextTask(task) ? 'Ответ проверяется самостоятельно по критериям' : 'Введи число или краткий ответ';
    el.taskContent.innerHTML = `
      <div class="task-top"><div class="task-breadcrumb">Математика (база) <span>›</span> <b>Задание ${escapeHtml(task.taskNumber)}</b></div><span class="task-status${solved && !isExam ? ' done' : ''}">${isExam ? `Авторский вариант · ${index + 1} из ${state.tasks.length}` : state.mode === 'topic' ? `Отработка типа · ${index + 1} из ${state.tasks.length}` : state.mode === 'collection' ? `Смешанная подборка · ${index + 1} из ${state.tasks.length}` : state.mode === 'warmup' ? `Разминка · ${index + 1} из ${state.tasks.length}` : state.mode === 'review' ? `Разбор после пробника · ${index + 1} из ${state.tasks.length}` : solved ? '✓ Решено / проверено' : `Авторское упражнение · ${index + 1} из ${state.tasks.length}`}</span></div>
      <h2 class="task-title">${escapeHtml(task.title)}</h2>
      <div class="task-topic"><span class="topic-dot"></span>${escapeHtml(task.taskType || 'Тренировочное задание')} <span class="source-chip">${escapeHtml(statementType)}</span></div>
      <div class="task-statement">${renderMarkdown(task.statement)}</div>
      ${renderTaskVisuals(task)}
      <div class="answer-box"><div class="answer-title-row"><span class="answer-title">Твой ответ</span><span class="answer-hint">${escapeHtml(formatNote)}</span></div>
        <form id="answer-form"><div class="answer-controls ${task.answerSchema?.type === 'fields' ? 'answer-controls-fields' : ''} ${task.answerSchema?.type === 'choice' || task.answerSchema?.type === 'multi-choice' ? 'answer-controls-choice' : ''}">${renderAnswerControls(task, answer, isExam, answerButtonText)}</div></form>
        <div class="feedback" id="answer-feedback" role="status" aria-live="polite"></div>
      </div>${taskActions}${solutionPanel}`;

    $('#answer-form')?.addEventListener('submit', checkAnswer);
    $('#answer-form')?.querySelectorAll('input,textarea,select').forEach((control) => {
      const saveInput = () => {
        const value = captureAnswerFromControls(task);
        if (isExam) state.examAnswers[task.externalId] = value;
        else state.values[task.externalId] = value;
        saveProgress();
        if (isExam) renderTaskList();
      };
      control.addEventListener('input', saveInput);
      control.addEventListener('change', saveInput);
    });
    $('#open-fipi-task')?.addEventListener('click', () => openFipiForTask(Number(task.taskNumber)));
    $('#toggle-solution')?.addEventListener('click', () => {
      state.solutionOpen = !state.solutionOpen;
      renderCurrentTask();
      if (state.solutionOpen) $('#solution-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    $('#mark-self-checked')?.addEventListener('click', () => {
      const currentAnswer = getTaskAnswer(task, false);
      if (!answerHasContent(currentAnswer)) {
        toast('Сначала запиши ход решения, затем сравни его с разбором.');
        $('#answer-input')?.focus();
        return;
      }
      state.selfChecked.add(task.externalId); state.solved.add(task.externalId); saveProgress();
      renderTaskList(); renderCurrentTask();
      toast('Самопроверка сохранена. Отметка основана на твоей оценке по критериям.');
    });
    $('#prev-task')?.addEventListener('click', () => {
      if (index > 0) selectTask(state.tasks[index - 1].externalId, { scroll: true });
    });
    $('#next-task')?.addEventListener('click', () => {
      if (state.mode === 'exam' && index >= state.tasks.length - 1) { requestFinishExam(false); return; }
      const nextIndex = index >= state.tasks.length - 1 ? 0 : index + 1;
      selectTask(state.tasks[nextIndex].externalId, { scroll: true });
    });
    const graphHost = $('#task-content .graph-svg-host');
    graphHost?.addEventListener('wheel', (event) => {
      event.preventDefault(); zoomGraph(task, event.deltaY < 0 ? 'zoom-in' : 'zoom-out');
    }, { passive: false });
  }

  function checkAnswer(event) {
    event.preventDefault();
    const task = currentTask();
    const feedback = $('#answer-feedback');
    if (!task || !feedback) return;
    const userAnswer = captureAnswerFromControls(task);
    if (!answerHasContent(userAnswer)) {
      feedback.className = 'feedback visible warning';
      feedback.textContent = 'Сначала введи ответ — даже попытка приблизит к решению.';
      $('#answer-input')?.focus();
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
    if (isLongTextTask(task)) {
      feedback.className = 'feedback visible warning';
      feedback.textContent = 'Решение сохранено, но оно не оценивается автоматически. Открой разбор, сверь критерии и отметь самопроверку.';
      saveProgress();
      return;
    }
    const matches = answersMatchTask(task, userAnswer);
    if (matches === true) {
      state.solved.add(task.externalId);
      feedback.className = 'feedback visible correct';
      feedback.textContent = 'Верно! Отличная работа — задание отмечено как решённое.';
      $('#answer-input')?.setAttribute('aria-invalid', 'false');
      saveProgress(); renderTaskList();
    } else if (matches === false) {
      feedback.className = 'feedback visible incorrect';
      feedback.textContent = 'Пока не совпало. Проверь вычисления или открой разбор — он поможет найти шаг, где возникла ошибка.';
      $('#answer-input')?.setAttribute('aria-invalid', 'true');
      saveProgress();
    } else {
      feedback.className = 'feedback visible warning';
      feedback.textContent = 'Для этого типа ответа нет безопасной автоматической проверки. Сверь результат с разбором.';
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

  function renderOfficialTaskLinks() {
    const hosts = document.querySelectorAll('#official-task-links, #official-task-links-topics');
    if (!hosts.length || !state.fipiLinks?.topics) return;
    const entries = Object.entries(state.fipiLinks.topics).sort((a, b) => Number(a[0]) - Number(b[0]));
    const renderedGroups = entries.map(([number, info]) => {
      const ids = (info.questionIds || []).map((qid, index) =>
        `<a class="official-question-link" href="${escapeHtml(fipiQuestionUrl(qid))}" target="_blank" rel="noopener noreferrer"><span>Пример ${index + 1}</span><small>${escapeHtml(qid)}</small><b aria-hidden="true">↗</b></a>`
      ).join('');
      const navigatorLink = info.navigator ? `<a class="official-navigator-link" href="${escapeHtml(info.navigator)}" target="_blank" rel="noopener noreferrer">Навигатор ФИПИ · PDF ↗</a>` : '';
      return `<details class="official-task-group"><summary><span class="official-task-number">№${escapeHtml(number)}</span><span class="official-task-summary"><strong>${escapeHtml(info.title || `Задание ${number}`)}</strong><small>${(info.questionIds || []).length} прямых ссылок на исходные примеры</small></span><span class="official-task-chevron">⌄</span></summary><div class="official-task-group-body"><div class="official-question-list">${ids}</div>${navigatorLink}</div></details>`;
    }).join('');
    hosts.forEach((host) => {
      host.innerHTML = renderedGroups || '<div class="empty-state">Ссылки на задания пока не настроены.</div>';
    });
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
      const group = (groups.get(n) || []).filter(isAutoGradableTask);
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
    if (el.search) el.search.value = '';
    if (el.typeFilter) el.typeFilter.value = 'all';
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
    if (el.search) el.search.value = '';
    if (el.typeFilter) el.typeFilter.value = 'all';
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
    if (state.mode !== 'exam' || !state.examEndAt || !el.examTimer) return;
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
    const unanswered = state.tasks.filter((task) => !answerHasContent(state.examAnswers[task.externalId])).length;
    const prompt = timedOut
      ? 'Время вышло. Ответы будут проверены.'
      : `Завершить вариант сейчас? Без ответа осталось: ${unanswered}. После завершения правильные ответы будут показаны.`;
    if (timedOut || window.confirm(prompt)) finishExam(timedOut);
  }

  function formatUserAnswer(value) {
    if (Array.isArray(value)) return value.join(', ');
    if (value && typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key}: ${item || '—'}`).join('; ');
    return String(value ?? '').trim() || 'нет ответа';
  }

  function finishExam(timedOut) {
    if (state.mode !== 'exam') return;
    stopTimer();
    const examTasks = [...state.tasks];
    const report = examTasks.map((task) => {
      const userAnswer = state.examAnswers[task.externalId] ?? '';
      const correct = answerHasContent(userAnswer) && answersMatchTask(task, userAnswer) === true;
      if (correct) state.solved.add(task.externalId);
      return { task, userAnswer, correct, answered: answerHasContent(userAnswer) };
    });
    const correctCount = report.filter((item) => item.correct).length;
    const answeredCount = report.filter((item) => item.answered).length;
    const examTotal = examTasks.length;
    const wrong = report.filter((item) => !item.correct);
    state.mode = 'catalog'; state.tasks = state.bankTasks; state.examEndAt = null; state.examAnswers = {};
    state.currentId = wrong.length ? wrong[0].task.externalId : state.bankTasks[0].externalId;
    state.solutionOpen = false;
    updateModeUI(); renderTaskList(); renderCurrentTask(); saveProgress();
    const title = timedOut ? 'Время вышло' : 'Авторский тренировочный вариант ЕГЭ+ завершён';
    const mistakesHtml = wrong.length ? `<div class="exam-result-list"><h3>Задания для разбора</h3>${wrong.map(({task,userAnswer}) => `<button type="button" class="result-review-row" data-review-task-id="${escapeHtml(task.externalId)}"><span class="result-review-number">№${escapeHtml(task.taskNumber)}</span><span class="result-review-main"><strong>${escapeHtml(task.title)}</strong><small>Твой ответ: ${escapeHtml(formatUserAnswer(userAnswer))} · Верный ответ: ${escapeHtml(formatExpectedAnswer(task))}</small></span><span class="result-review-action">Разобрать →</span></button>`).join('')}</div>` : '<div class="exam-perfect-note">Отличный результат! Все ответы верны.</div>';
    el.examResultContent.innerHTML = `<div class="dialog-icon">${correctCount >= 15 ? '✓' : '∑'}</div><h2 id="exam-result-heading">${title}</h2><p class="exam-result-lead">Результат: <strong>${correctCount} из ${examTotal}</strong>. Ответов заполнено: ${answeredCount}; без ответа: ${examTotal-answeredCount}.</p><div class="exam-result-bar"><span style="width:${Math.round(correctCount/examTotal*100)}%"></span></div><div class="exam-result-percent">${Math.round(correctCount/examTotal*100)}% правильных ответов</div>${mistakesHtml}<div class="dialog-actions"><button class="secondary-button" id="exam-result-close" type="button">Вернуться к базе</button><button class="primary-button" id="exam-result-new" type="button">Новый вариант ↗</button></div>`;
    if (!el.examResultDialog.open) el.examResultDialog.showModal();
    toast(`Авторский пробный вариант: ${correctCount} из ${examTotal} верно.`);
  }

  function installEvents() {
    document.addEventListener('click', (event) => {
      const graphButton = event.target.closest('[data-graph-action]');
      if (graphButton) {
        const graph = graphButton.closest('[data-graph-id]');
        const task = state.bankTasks.find((item) => item.externalId === graph?.dataset.graphId);
        if (task) zoomGraph(task, graphButton.dataset.graphAction);
        return;
      }
      const imageButton = event.target.closest('[data-zoom-image]');
      if (imageButton) {
        openImageLightbox(imageButton.dataset.zoomImage, imageButton.dataset.imageAlt, imageButton.dataset.imageCaption);
        return;
      }
      if (event.target.closest('[data-lightbox-close]')) { el.imageLightbox?.close(); return; }
      const zoomButton = event.target.closest('[data-lightbox-zoom]');
      if (zoomButton) {
        const action = zoomButton.dataset.lightboxZoom;
        state.lightboxScale = action === 'reset' ? 1 : state.lightboxScale + (action === 'in' ? 0.25 : -0.25);
        updateLightboxZoom();
      }
    });
    el.lightboxStage?.addEventListener('wheel', (event) => {
      event.preventDefault(); state.lightboxScale += event.deltaY < 0 ? 0.15 : -0.15; updateLightboxZoom();
    }, { passive: false });
    el.imageLightbox?.addEventListener('click', (event) => {
      if (event.target === el.imageLightbox) el.imageLightbox.close();
    });
    el.search?.addEventListener('input', renderTaskList);
    el.typeFilter?.addEventListener('change', renderTaskList);
    el.taskList?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-task-id]');
      if (button) selectTask(button.dataset.taskId);
    });
    el.allTasksButton?.addEventListener('click', showAllTasks);
    el.startTopicPracticeButton?.addEventListener('click', startTopicPractice);
    el.randomSetButton?.addEventListener('click', startRandomCollection);
    el.startWarmupButton?.addEventListener('click', startWarmup);
    document.addEventListener('click', (event) => {
      const topicButton = event.target.closest('[data-topic-number]');
      if (topicButton) {
        const number = Number(topicButton.dataset.topicNumber);
        if (PAGE !== 'topics') { window.location.href = `./topics.html?number=${encodeURIComponent(number)}`; return; }
        startTopicPracticeByNumber(number);
      }
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
        state.mode = 'review'; state.tasks = state.bankTasks; state.examEndAt = null;
        updateModeUI(); selectTask(id, { scroll: false });
        $('.practice-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (event.target.closest('#exam-result-close')) el.examResultDialog.close();
      if (event.target.closest('#exam-result-new')) { el.examResultDialog.close(); startExam(); }
    });
    el.resetProgress?.addEventListener('click', () => el.resetDialog?.showModal());
    el.resetDialog?.addEventListener('close', () => {
      if (el.resetDialog.returnValue !== 'confirm') return;
      state.solved.clear(); state.selfChecked.clear(); state.attempts = {}; state.values = {};
      saveProgress(); renderTaskList(); renderCurrentTask(); toast('Прогресс сброшен. Можно начать заново.');
    });
  }

  async function init() {
    // The legacy task engine is currently populated for basic mathematics only.
    // Other subjects are rendered by multi-exam.js and must never fall back to math questions.
    if (window.EGE_ACTIVE_SUBJECT_ID && window.EGE_ACTIVE_SUBJECT_ID !== 'math_basic') return;
    readProgress(); installEvents();
    try {
      const response = await fetch(DATA_URL, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      try {
        const fipiResponse = await fetch(FIPI_LINKS_URL, { cache: 'no-cache' });
        if (fipiResponse.ok) state.fipiLinks = await fipiResponse.json();
      } catch (_) { state.fipiLinks = null; }
      // Official-only policy: author-created/generated tasks must never appear as real EGE tasks.
      state.bankTasks = sortTasks(data.filter((task) =>
        task.subjectId === ACTIVE_SUBJECT_KEY &&
        task.sourceType === 'official_fipi' &&
        task.isVerified === true &&
        task.sourceUrl &&
        task.externalId
      ));
      if (!state.bankTasks.length) {
        const officialUrl = state.fipiLinks?.bankUrl || 'https://ege.fipi.ru/bank/';
        const variantUrl = 'https://fipi.ru/ege/otkrytyy-bank-zadaniy-ege/otkrytyye-varianty-kim-ege';
        const notice = '<div class="empty-state official-only-empty"><strong>Официальный банк ещё не импортирован</strong><p>Мы не показываем авторские упражнения вместо заданий ФИПИ. Открой первоисточник: там опубликованы оригинальные условия и материалы.</p><p><a href="' + escapeHtml(officialUrl) + '" target="_blank" rel="noopener noreferrer">Открытый банк заданий ФИПИ ↗</a></p><p><a href="' + escapeHtml(variantUrl) + '" target="_blank" rel="noopener noreferrer">Оригинальные варианты КИМ ↗</a></p></div>';
        if (el.taskList) el.taskList.innerHTML = notice;
        if (el.taskContent) el.taskContent.innerHTML = notice;
        if (el.listCount) el.listCount.textContent = '0';
        if (el.statTotal) el.statTotal.textContent = '0';
        if (el.statDone) el.statDone.textContent = '0';
        if (el.statPercent) el.statPercent.textContent = '0%';
        if (el.progressFraction) el.progressFraction.textContent = '0 / 0';
        if (el.progressBar) el.progressBar.style.width = '0%';
        ['start-topic-practice-button','start-warmup-button','random-set-button','start-exam-button'].forEach((id) => {
          const button = document.getElementById(id);
          if (button) { button.disabled = true; button.title = 'Станет доступно после проверки и импорта официальных заданий ФИПИ'; }
        });
        renderOfficialTaskLinks();
        const status = document.querySelector('.saved-status');
        if (status) status.textContent = 'Официальный банк не импортирован';
        return;
      }
      const bankIds = new Set(state.bankTasks.map((task) => task.externalId));
      state.solved = new Set([...state.solved].filter((id) => bankIds.has(id)));
      state.tasks = state.bankTasks;
      if (state.restoreSession && PAGE === 'study') {
        const restoredTasks = state.restoreSession.activeTaskIds.map((id) => state.bankTasks.find((task) => task.externalId === id)).filter(Boolean);
        if (restoredTasks.length && (state.restoreSession.mode !== 'exam' || restoredTasks.length === 21)) {
          state.tasks = sortTasks(restoredTasks);
          state.mode = ['exam', 'collection', 'topic', 'warmup'].includes(state.restoreSession.mode) ? state.restoreSession.mode : 'collection';
          state.examEndAt = state.mode === 'exam' ? state.restoreSession.examEndAt : null;
        }
      }
      if (!['topics', 'study'].includes(PAGE)) { state.mode = 'catalog'; state.tasks = state.bankTasks; state.examEndAt = null; }
      if (!state.tasks.some((task) => task.externalId === state.currentId)) state.currentId = state.tasks[0].externalId;
      if (!state.tasks.length) state.tasks = state.bankTasks;
      populateFilters();
      renderTopicGroups();
      renderOfficialTaskLinks();
      if (state.mode === 'topic' && el.topicModeSelect && state.tasks[0]?.taskType) el.topicModeSelect.value = state.tasks[0].taskType;
      updateModeUI(); renderTaskList(); renderCurrentTask();
      // Do not overwrite an in-progress session just because the user opens a different page.
      if (PAGE === 'study') saveProgress(); else updateStats();
      const requestedTopicNumber = Number(new URLSearchParams(window.location.search).get('number'));
      if (PAGE === 'topics' && Number.isInteger(requestedTopicNumber) && requestedTopicNumber >= 1 && requestedTopicNumber <= 21) {
        startTopicPracticeByNumber(requestedTopicNumber);
      }
      if (state.mode === 'exam') {
        if (!state.examEndAt || state.examEndAt <= Date.now()) finishExam(true);
        else startTimer();
      }
    } catch (error) {
      if (el.taskContent) el.taskContent.innerHTML = `<div class="empty-state"><strong>Не удалось загрузить задания</strong>${escapeHtml(error.message || 'Проверь, что сайт запущен через локальный сервер, а не открыт как файл.')}</div>`;
      if (el.taskList) el.taskList.innerHTML = '<div class="empty-state">База не загружена</div>';
    }
  }
  document.addEventListener('DOMContentLoaded', init);
})();

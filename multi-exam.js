(() => {
  'use strict';
  const PAGE = document.body.dataset.page || 'home';
  const PARAMS = new URLSearchParams(window.location.search);
  const ACTIVE_KEY = 'ege-plus-active-subject-v1';
  const STORED = (() => { try { return localStorage.getItem(ACTIVE_KEY); } catch (_) { return null; } })();
  const KNOWN = new Set(['math_basic','math_profile','russian','physics','chemistry','informatics','biology','history','social_science','geography','literature','english','german','french','spanish','chinese']);
  const requested = PARAMS.get('subject');
  let activeId = PAGE === 'subjects' ? null : (KNOWN.has(requested) ? requested : (KNOWN.has(STORED) ? STORED : 'math_basic'));
  if (PAGE === 'home' && !requested && !STORED) activeId = null;
  window.EGE_ACTIVE_SUBJECT_ID = PAGE === 'home' ? 'math_basic' : (activeId || 'math_basic');
  window.EGE_SUBJECT_EXPLICIT = Boolean(requested || STORED);
  if (activeId && PAGE !== 'subjects') {
    try { localStorage.setItem(ACTIVE_KEY, activeId); } catch (_) { /* storage is optional */ }
  }

  const ROOT = './';
  const URLS = {
    home: 'index.html', subjects: 'subjects.html', subject: 'subject.html', topics: 'topics.html',
    study: 'self-study.html', theory: 'theory.html', official: 'official.html'
  };
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const routeHref = (page, subjectId = activeId) => {
    const target = URLS[page] || 'index.html';
    if (!subjectId || ['home','subjects'].includes(page)) return `./${target}`;
    return `./${target}?subject=${encodeURIComponent(subjectId)}`;
  };
  const fipiPage = 'https://fipi.ru/ege/demoversii-specifikacii-kodifikatory';
  const fipiBank = 'https://ege.fipi.ru/bank/';
  const fipiVariants = 'https://fipi.ru/ege/otkrytyy-bank-zadaniy-ege/otkrytyye-varianty-kim-ege';
  let registry = null;
  let flat = [];

  function flattenSubjects(data) {
    const entries = [];
    for (const subject of data.subjects || []) {
      if (Array.isArray(subject.tracks)) {
        for (const track of subject.tracks) entries.push({ ...subject, ...track, parentSubject: subject, officialSubjectId: subject.id, isTrack: true });
      } else entries.push({ ...subject, parentSubject: subject, officialSubjectId: subject.id, isTrack: false, name: subject.name, shortName: subject.name });
    }
    return entries;
  }
  function context() { return flat.find((item) => item.id === activeId) || flat.find((item) => item.id === 'math_basic'); }
  function statusBadge(item) {
    if (item.status === 'available') return '<span class="multi-status status-ready"><i></i> Тренажёр доступен</span>';
    if (item.status === 'pilot') return '<span class="multi-status status-pilot"><i></i> Начальное наполнение</span>';
    if (item.status === 'multi-track') return '<span class="multi-status status-pilot"><i></i> Два уровня</span>';
    return '<span class="multi-status status-planned"><i></i> Раздел наполняется</span>';
  }
  function cardLink(url, title, description, icon, className = '') {
    return `<a class="multi-resource-card ${className}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><span class="multi-resource-icon">${icon}</span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(description)}</small><span class="multi-resource-action">Открыть ↗</span></a>`;
  }
  function routeCard(page, title, desc, icon, item = context()) {
    const href = routeHref(page, item?.id || 'math_basic');
    return `<a class="multi-route-card" href="${href}"><span class="multi-route-icon">${icon}</span><span class="multi-route-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(desc)}</small></span><span class="multi-route-arrow">↗</span></a>`;
  }
  function statusParagraph(item) {
    if (item.bankCount > 0 && item.status !== 'available') return `<div class="multi-notice notice-pilot"><strong>Есть стартовый набор упражнений</strong><p>${escapeHtml(item.description || 'Доступна небольшая авторская подборка.')} Это начальное наполнение, а не полный экзаменационный банк. Сверяй структуру и критерии с актуальной спецификацией ФИПИ.</p></div>`;
    if (item.status === 'available') return `<div class="multi-notice notice-ready"><strong>Тренажёр готов</strong><p>${escapeHtml(item.description || 'Локальная база упражнений доступна.')} Прогресс сохраняется отдельно от других предметов в этом браузере.</p></div>`;
    if (item.status === 'pilot') return `<div class="multi-notice notice-pilot"><strong>Пока это стартовая версия</strong><p>${escapeHtml(item.description || 'Локальный банк содержит только демонстрационные материалы.')} Полноценный пробник и статистику по всему экзамену пока не включаем, чтобы не показывать неполную базу как готовую.</p></div>`;
    return `<div class="multi-notice notice-planned"><strong>Раздел оформлен, собственный банк готовится</strong><p>Навигация, карта тем и переходы к официальным материалам доступны. Авторские задания, автоматическая проверка и полноценный пробный вариант для этого предмета ещё не опубликованы.</p></div>`;
  }
  function officialCards(item) {
    const s = item.parentSubject || item;
    const src = s.sources || {};
    const yearProject = src.project2027 || fipiPage;
    const approved2026 = src.approved2026 || fipiPage;
    return `<div class="multi-resource-grid">
      ${cardLink(src.fipiPage || fipiPage, 'Демоверсии, спецификации и кодификаторы ФИПИ', 'Страница официальных документов по выбранному предмету', '↗')}
      ${cardLink(yearProject, 'Материалы ЕГЭ-2027 · проект', 'Пакет ФИПИ: демоверсия, спецификация и кодификатор. На сайте ФИПИ документы 2027 обозначены как проекты.', '27')}
      ${cardLink(approved2026, 'Материалы ЕГЭ-2026 · утверждённая версия', 'Официальный архив документов предыдущего экзаменационного года для сравнения', '26')}
      ${cardLink(src.openVariant2026 || src.openVariants || fipiVariants, 'Реальный открытый вариант ЕГЭ-2026', 'Оригинальный архив КИМ ФИПИ для скачивания: задания и материалы официального варианта', '26')}
      ${cardLink(src.openBank || fipiBank, 'Открытый банк заданий ЕГЭ', 'Официальный банк заданий ФИПИ для практики по типам', '▤')}
      ${cardLink(src.openVariants || fipiVariants, 'Все открытые варианты КИМ', 'Официальная страница с вариантами по всем предметам и годам', '▧')}
    </div><p class="multi-source-note">Официальные архивы могут скачиваться как ZIP. Перед использованием ориентируйся на статус документа и год, указанные на сайте ФИПИ. Не смешивай проектные материалы 2027 года с утверждёнными документами 2026 года.</p>`;
  }
  function themeCards(item, mode = 'topics') {
    const themes = item.themes || item.parentSubject?.themes || [];
    if (!themes.length) return '<p class="multi-empty-note">Карта тем будет добавлена после сверки с актуальным кодификатором.</p>';
    const targetPage = mode === 'theory' ? 'official' : 'theory';
    const linkLabel = mode === 'theory' ? 'Материалы ФИПИ' : 'Перейти к теории';
    return `<div class="multi-theme-grid">${themes.map((theme, i) => `<article class="multi-theme-card"><span class="multi-theme-number">${String(i+1).padStart(2,'0')}</span><div><h3>${escapeHtml(theme.title)}</h3><p>${escapeHtml(theme.description || '')}</p></div><a class="multi-theme-link" href="${routeHref(targetPage, item.id)}">${linkLabel} ↗</a></article>`).join('')}</div>`;
  }
  function topContext(item, kicker, title, description) {
    const name = item.shortName || item.name;
    return `<section class="multi-hero"><div class="multi-breadcrumb"><a href="./subjects.html">Все предметы</a><span>›</span><span>${escapeHtml(name)}</span></div><span class="section-kicker">${escapeHtml(kicker)}</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p><div class="multi-hero-bottom">${statusBadge(item)}<a class="multi-change-subject" href="./subjects.html">Сменить предмет ↗</a></div></section>`;
  }
  function setupGlobalQuickSearch() {
    if (document.getElementById('ege-global-search')) return;
    const nav = document.querySelector('.topbar');
    if (!nav) return;
    const panel = document.createElement('div');
    panel.className = 'ege-quick-search';
    panel.innerHTML = '<label class="ege-quick-search-field"><span aria-hidden="true">⌕</span><input id="ege-global-search" type="search" autocomplete="off" placeholder="Найти предмет или тему…" aria-label="Поиск по предметам и темам" aria-controls="ege-global-search-results" aria-expanded="false"><kbd>Ctrl K</kbd></label><div class="ege-quick-search-results" id="ege-global-search-results" hidden></div>';
    nav.insertAdjacentElement('afterend', panel);
    const input = panel.querySelector('input');
    const results = panel.querySelector('.ege-quick-search-results');
    let index = [];
    const buildIndex = (data) => {
      const entries = [];
      (data.subjects || []).forEach((s) => {
        const tracks = Array.isArray(s.tracks) ? s.tracks : [s];
        tracks.forEach((t) => {
          entries.push({ title:t.name || s.name, subtitle:'Предмет · ' + (t.statusLabel || s.statusLabel || 'подготовка'), href:'./subject.html?subject='+encodeURIComponent(t.id || s.id), terms:[s.name,t.name,t.shortName,s.description,...(t.themes||s.themes||[]).map(x=>x.title)].filter(Boolean).join(' ').toLowerCase(), kind:'subject' });
          (t.themes || (!s.tracks ? s.themes : []) || []).forEach((theme) => entries.push({ title:theme.title, subtitle:(t.shortName || t.name || s.name)+' · тема', href:'./topics.html?subject='+encodeURIComponent(t.id || s.id), terms:[theme.title,theme.description,s.name,t.name].filter(Boolean).join(' ').toLowerCase(), kind:'theme' }));
        });
      });
      return entries;
    };
    const draw = () => {
      const q = input.value.trim().toLocaleLowerCase('ru');
      if (!q) { results.hidden = true; input.setAttribute('aria-expanded','false'); results.innerHTML = ''; return; }
      const words = q.split(/\s+/).filter(Boolean);
      const found = index.filter(item => words.every(word => item.terms.includes(word) || item.title.toLocaleLowerCase('ru').includes(word))).slice(0,8);
      results.innerHTML = found.length ? found.map(item=>'<a class="ege-search-result" href="'+escapeHtml(item.href)+'"><span class="ege-search-result-icon">'+(item.kind==='theme'?'#':'↗')+'</span><span><strong>'+escapeHtml(item.title)+'</strong><small>'+escapeHtml(item.subtitle)+'</small></span><span aria-hidden="true">→</span></a>').join('') : '<p class="ege-search-empty">Ничего не найдено. Попробуй другое слово.</p>';
      results.hidden = false;
      input.setAttribute('aria-expanded','true');
    };
    input.addEventListener('input', draw);
    document.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); input.focus(); input.select();
      } else if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey &&
        !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName) &&
        !document.activeElement?.isContentEditable) {
        event.preventDefault(); input.focus();
      }
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') { input.value=''; draw(); results.hidden=true; input.setAttribute('aria-expanded','false'); input.blur(); }
      if (event.key === 'Enter') { const first=results.querySelector('a'); if(first) window.location.href=first.href; }
    });
    document.addEventListener('click', event => { if (!panel.contains(event.target)) results.hidden=true; });
    fetch('./subjects.json',{cache:'no-cache'}).then(response=>{if(!response.ok)throw new Error('catalog');return response.json();}).then(data=>{index=buildIndex(data);}).catch(()=>{});
  }

  function renderSubjectsCatalog() {
    const host = document.getElementById('subjects-catalog'); if (!host || !registry) return;
    const cards = registry.subjects.map((s) => {
      if (s.id === 'mathematics') {
        return `<article class="subject-card subject-card-featured" data-category="mandatory" data-search="математика база профильный алгебра геометрия">
          <div class="subject-card-top"><span class="subject-icon subject-icon-purple">${escapeHtml(s.icon)}</span><span class="subject-group-tag">Обязательный предмет</span></div><h2>${escapeHtml(s.name)}</h2><p>${escapeHtml(s.description)}</p>
          <div class="subject-level-list">${s.tracks.map(t => `<a class="subject-level-option" href="./subject.html?subject=${encodeURIComponent(t.id)}"><span><strong>${escapeHtml(t.name)}</strong><small>${escapeHtml(t.statusLabel)}${t.id === 'math_basic' ? ' · 441 упражнение · 21 вариант на каждый тип' : t.id === 'math_profile' ? ' · 26 авторских упражнений' : ''}</small></span><span>↗</span></a>`).join('')}</div>
        </article>`;
      }
      return `<article class="subject-card" data-category="${escapeHtml(s.category)}" data-search="${escapeHtml((s.name+' '+s.description+' '+s.themes.map(t=>t.title).join(' ')).toLowerCase())}"><div class="subject-card-top"><span class="subject-icon">${escapeHtml(s.icon)}</span><span class="subject-group-tag">${s.category === 'mandatory' ? 'Обязательный' : 'По выбору'}</span></div><h2>${escapeHtml(s.name)}</h2><p>${escapeHtml(s.description)}</p><div class="subject-card-footer"><span class="multi-status status-planned"><i></i> ${s.bankCount > 0 ? `Стартовый банк · ${s.bankCount} упражнений` : 'Структура готова · банк наполняется'}</span><a class="subject-open-button" href="./subject.html?subject=${encodeURIComponent(s.id)}">Открыть предмет ↗</a></div></article>`;
    }).join('');
    host.innerHTML = cards;
    const search = document.getElementById('subjects-search');
    const filterButtons = [...document.querySelectorAll('[data-subject-filter]')];
    let filter = 'all';
    const apply = () => {
      const q = (search?.value || '').trim().toLowerCase();
      let n = 0;
      host.querySelectorAll('.subject-card').forEach((card) => {
        const visible = (filter === 'all' || card.dataset.category === filter) && (!q || (card.dataset.search || '').includes(q) || card.textContent.toLowerCase().includes(q));
        card.hidden = !visible; if (visible) n++;
      });
      const count = document.getElementById('subjects-result-count'); if (count) count.textContent = `${n} ${n === 1 ? 'предмет' : n > 1 && n < 5 ? 'предмета' : 'предметов'}`;
    };
    search?.addEventListener('input', apply);
    filterButtons.forEach((btn) => btn.addEventListener('click', () => { filter = btn.dataset.subjectFilter || 'all'; filterButtons.forEach(b => { b.classList.toggle('selected', b === btn); b.setAttribute('aria-pressed', String(b === btn)); }); apply(); }));
    apply();
  }
  function renderSubjectDashboard(item) {
    const host = document.getElementById('subject-dashboard'); if (!host || !item) return;
    const themes = item.themes || [];
    const isReady = item.status === 'available';
    const source = item.parentSubject?.sources || item.sources || {};
    document.title = `${item.shortName || item.name} — ЕГЭ+`;
    host.innerHTML = `${topContext(item, 'ПАСПОРТ ЭКЗАМЕНА', `${item.shortName || item.name}: подготовка к ЕГЭ`, item.description)}
      <section class="multi-dashboard-stats"><article><strong>${item.bankCount > 0 ? item.bankCount : '—'}</strong><span>${isReady ? (item.id === 'math_basic' ? 'тренировочных упражнений' : 'авторских упражнений') : item.status === 'pilot' ? 'упражнений в стартовом банке' : 'собственный банк готовится'}</span></article><article><strong>${themes.length || '—'}</strong><span>направлений для подготовки</span></article><article><strong>${item.durationMinutes ? `${item.durationMinutes} мин` : 'ФИПИ'}</strong><span>${item.durationMinutes ? 'время для базового пробника' : 'официальная структура экзамена'}</span></article></section>
      ${statusParagraph(item)}
      <section class="multi-section-block"><div class="multi-section-heading"><div><span class="section-kicker">РАБОЧЕЕ ПРОСТРАНСТВО</span><h2>Выбери, как готовиться</h2></div><p>Каждое направление открывается на отдельной странице. Выбранный предмет сохраняется при переходах.</p></div><div class="multi-route-grid">${routeCard('topics','Темы и варианты','Карта экзамена и доступные типы заданий','№',item)}${routeCard('study','Самоподготовка','Разминка и пробные варианты','⏱',item)}${routeCard('theory','Теория','Темы, правила и опорные материалы','∑',item)}${routeCard('official','Материалы ФИПИ','Демоверсии, спецификации, банк задач','↗',item)}</div></section>
      <section class="multi-section-block"><div class="multi-section-heading"><div><span class="section-kicker">КАРТА ПРЕДМЕТА</span><h2>Основные направления</h2></div><a href="${routeHref('topics',item.id)}">Все темы →</a></div>${themeCards(item,'topics')}</section>
      <section class="multi-section-block"><div class="multi-section-heading"><div><span class="section-kicker">ПЕРВОИСТОЧНИКИ</span><h2>Официальные материалы</h2></div><a href="${routeHref('official',item.id)}">Все источники →</a></div><div class="multi-mini-resources">${cardLink(source.fipiPage || fipiPage,'Демоверсии и кодификаторы ФИПИ','Документы по предмету','↗')}${cardLink(source.openBank || fipiBank,'Открытый банк заданий','Оригинальные формулировки','▤')}</div></section>`;
  }
  function renderGenericSection(item, page) {

    const host = document.getElementById('multi-subject-page-content'); if (!host) return;
    document.body.dataset.multiSubjectPage = 'true';
    host.hidden = false;
    const name = item.shortName || item.name;
    const parentSources = item.parentSubject?.sources || item.sources || {};
    const headTitle = page === 'topics' ? `${name}: темы и варианты` : page === 'study' ? `Самоподготовка · ${name}` : page === 'theory' ? `Теория по предмету «${name}»` : `Официальные материалы: ${name}`;
    const kicker = page === 'topics' ? 'КАТАЛОГ ПОДГОТОВКИ' : page === 'study' ? 'САМОСТОЯТЕЛЬНАЯ РАБОТА' : page === 'theory' ? 'ТЕОРИЯ И ПОВТОРЕНИЕ' : 'ПЕРВОИСТОЧНИКИ';
    const desc = page === 'topics' ? 'Карта направлений помогает спланировать подготовку. Номера заданий и критерии оценивания нужно сверять с актуальными документами ФИПИ.' : page === 'study' ? 'Здесь будут режимы тренировки для выбранного предмета. Мы включаем автоматическую проверку только тогда, когда база и критерии действительно готовы.' : page === 'theory' ? 'Структура тем подготовлена для наполнения проверенными конспектами, формулами и примерами. Сейчас это карта подготовки, а не законченный учебник.' : 'Оригинальные демонстрационные материалы, кодификаторы, спецификации и открытые варианты находятся у официального источника.';
    let specific = '';
    if (page === 'topics') {
      specific = `<section class="multi-section-block"><div class="multi-section-heading"><div><span class="section-kicker">НАПРАВЛЕНИЯ</span><h2>Карта тем</h2></div><span class="multi-muted">Не официальная нумерация заданий</span></div>${themeCards(item,'topics')}</section><section class="multi-section-block"><div class="multi-section-heading"><div><span class="section-kicker">ТРЕНИРОВКА</span><h2>Практика по этому предмету</h2></div></div>${statusParagraph(item)}<div class="multi-action-row"><a class="primary-button" href="${routeHref('official',item.id)}">Открыть оригиналы ФИПИ ↗</a><a class="secondary-button" href="${routeHref('theory',item.id)}">Перейти к карте теории</a></div></section>`;
    } else if (page === 'study') {
      const local = item.status === 'available';
      specific = `<section class="multi-section-block"><div class="multi-section-heading"><div><span class="section-kicker">РЕЖИМЫ ПОДГОТОВКИ</span><h2>${local ? 'Начни с банка заданий' : 'Подготовка включается по мере проверки банка'}</h2></div></div>${statusParagraph(item)}<div class="multi-mode-grid"><article class="multi-mode-card"><span class="multi-mode-icon">⚡</span><h3>${item.id === 'math_profile' ? 'Практика по банку' : 'Быстрая разминка'}</h3><p>${local ? (item.id === 'math_profile' ? 'Практика по доступным заданиям профильной математики с проверкой короткого ответа.' : 'Пять случайных упражнений из проверенной авторской базы.') : 'Станет доступна после появления достаточного количества качественных заданий с проверенными ответами.'}</p><span class="multi-mode-state ${local?'state-ready':'state-locked'}">${local?'Доступно в тренажёре базы':'Пока не подключено'}</span>${local?(item.id === 'math_profile' ? '<a class="primary-button" href="#subject-practice-bank">К упражнениям →</a>' : `<a class="primary-button" href="${routeHref('study','math_basic')}">Начать →</a>`):`<a class="secondary-button" href="${routeHref('official',item.id)}">Официальные материалы ↗</a>`}</article><article class="multi-mode-card"><span class="multi-mode-icon">↻</span><h3>${item.id === 'math_profile' ? 'Упражнения по темам' : 'Смешанная подборка'}</h3><p>${item.id === 'math_profile' ? 'Все доступные авторские упражнения профильного уровня с проверкой коротких ответов.' : 'Случайный набор разных типов с автоматической проверкой каждого ответа.'}</p><span class="multi-mode-state ${local?'state-ready':'state-locked'}">${local?'Доступно в тренажёре базы':'Откроется после наполнения банка'}</span>${local?(item.id === 'math_profile' ? '<a class="secondary-button" href="#subject-practice-bank">К упражнениям →</a>' : `<a class="secondary-button" href="${routeHref('study','math_basic')}">Собрать подборку →</a>`):`<a class="secondary-button" href="${routeHref('official',item.id)}">Пока решать у ФИПИ ↗</a>`}</article><article class="multi-mode-card"><span class="multi-mode-icon">◷</span><h3>Пробный вариант</h3><p>Режим экзамена должен соответствовать актуальной спецификации: структуре, времени и критериям предмета.</p><span class="multi-mode-state state-locked">${local ? (item.id === 'math_profile' ? 'Профильная математика · по спецификации ФИПИ' : '180 минут · математика база') : 'Будет настроено по спецификации ФИПИ'}</span><a class="secondary-button" href="${parentSources.openVariant2026 || routeHref('official',item.id)}" target="_blank" rel="noopener noreferrer">Открыть оригинальный вариант 2026 ↗</a></article></div></section>`;
    } else if (page === 'theory') {
      if (item.id === 'informatics') {
        specific = `<section class="multi-section-block"><div class="multi-section-heading"><div><span class="section-kicker">ТЕОРИЯ И РАЗБОРЫ · ЕГЭ-2027</span><h2>Все 27 позиций экзамена</h2></div><span class="multi-muted">Авторские объяснения методов</span></div><p>Для каждой позиции есть алгоритм решения, мини-пример и список типичных ошибок. Это учебный конспект, не копия заданий ФИПИ; точную формулировку и актуальные критерии проверяй по первоисточникам.</p><div id="informatics-guide" class="informatics-guide" aria-live="polite"><div class="multi-notice">Загружаем карту 27 заданий…</div></div><div class="multi-action-row"><a class="primary-button" href="${parentSources.project2027}" target="_blank" rel="noopener noreferrer">Проект демоверсии ФИПИ-2027 ↗</a><a class="secondary-button" href="https://www.kpolyakov.spb.ru/school/ege.htm" target="_blank" rel="noopener noreferrer">Материалы Полякова ↗</a><a class="secondary-button" href="https://inf-ege.sdamgia.ru/" target="_blank" rel="noopener noreferrer">Решу ЕГЭ ↗</a><a class="secondary-button" href="https://kompege.ru/" target="_blank" rel="noopener noreferrer">КЕГЭ ↗</a></div></section>`;
      } else {
        specific = `<section class="multi-section-block"><div class="multi-section-heading"><div><span class="section-kicker">СТРУКТУРА ТЕОРИИ</span><h2>Что нужно повторить</h2></div></div>${themeCards(item,'theory')}<div class="multi-notice notice-planned"><strong>Что важно</strong><p>Сейчас здесь карта направлений. Полноценные конспекты, примеры и упражнения будут добавляться по одному блоку после сверки с официальным кодификатором и редакторской проверки. Мы не выдаём пустой план за готовую теорию.</p></div><div class="multi-action-row"><a class="primary-button" href="${parentSources.fipiPage || fipiPage}" target="_blank" rel="noopener noreferrer">Открыть кодификатор ФИПИ ↗</a><a class="secondary-button" href="${routeHref('topics',item.id)}">Темы и варианты</a></div></section>`;
      }
    } else {
      specific = `<section class="multi-section-block"><div class="multi-section-heading"><div><span class="section-kicker">ОФИЦИАЛЬНЫЕ РЕСУРСЫ</span><h2>Документы по предмету</h2></div></div>${officialCards(item)}</section>`;
    }
    if (page === 'study' && item.id !== 'math_basic') {
      specific += `<section class="multi-section-block subject-practice-block"><div class="multi-section-heading"><div><span class="section-kicker">ПРАКТИКА</span><h2>${item.id === 'math_profile' ? 'Банк профильной математики' : 'Стартовый банк заданий'}</h2></div><span class="multi-muted" id="subject-bank-count">Загружаем задания…</span></div><p class="subject-bank-note">Это авторские упражнения по темам ЕГЭ, не дословные задания ФИПИ. Проверка коротких ответов выполняется по эталону; развёрнутые ответы требуют проверки по критериям.</p><div id="subject-practice-bank" class="subject-practice-bank" aria-live="polite"></div></section>`;
    }
    document.title = `${headTitle} — ЕГЭ+`;
    host.innerHTML = `${topContext(item,kicker,headTitle,desc)}<div class="multi-page-context">${statusBadge(item)}<a href="./subject.html?subject=${encodeURIComponent(item.id)}">Паспорт предмета ↗</a><a href="./subjects.html">Выбрать другой предмет</a></div>${specific}`;
    if (page === 'study' && item.id !== 'math_basic') renderSubjectPractice(item);
  }
  function renderHomePreview(data) {
    const host = document.getElementById('home-subject-preview-grid'); if (!host) return;
    const visible = [];
    const mat = data.subjects.find(s => s.id === 'mathematics');
    if (mat) visible.push({ ...mat, id:'math_basic', name:'Математика · база', shortName:'Математика · база', status:'available', statusLabel:'Тренажёр доступен', bankCount:441, parentSubject:mat });
    const russian = data.subjects.find(s => s.id === 'russian'); if (russian) visible.push(russian);
    const info = data.subjects.find(s => s.id === 'informatics'); if (info) visible.push(info);
    const phys = data.subjects.find(s => s.id === 'physics'); if (phys) visible.push(phys);
    const social = data.subjects.find(s => s.id === 'social_science'); if (social) visible.push(social);
    const english = data.subjects.find(s => s.id === 'english'); if (english) visible.push(english);
    host.innerHTML = visible.map(item => `<a class="subject-preview-card" href="./subject.html?subject=${encodeURIComponent(item.id)}"><span class="subject-preview-icon">${escapeHtml(item.icon || 'ЕГЭ')}</span><span class="subject-preview-copy"><strong>${escapeHtml(item.shortName || item.name)}</strong><small>${item.status === 'available' ? '441 тренировочное упражнение · тренажёр готов' : item.id === 'informatics' ? '27 заданий и разборы · учебный банк' : 'Первоисточники ФИПИ · раздел наполняется'}</small></span><span class="subject-preview-arrow">↗</span></a>`).join('');
  }

  async function renderInformaticsGuide(){
    const host=document.getElementById('informatics-guide');if(!host)return;
    try{
      const response=await fetch('./informatics_guide.json',{cache:'no-cache'});if(!response.ok)throw new Error('Не удалось загрузить конспект.');
      const guide=await response.json();const items=guide.items||[];let filter='all',query='';
      const draw=()=>{
        const q=query.trim().toLocaleLowerCase('ru');
        const visible=items.filter(item=>(filter==='all'||filter==='part1'&&item.part===1||filter==='part2'&&item.part===2)&&(!q||[item.number,item.title,item.kind,item.goal,...item.method,...item.pitfalls].join(' ').toLocaleLowerCase('ru').includes(q)));
        host.innerHTML=`<div class="informatics-guide-tools"><label class="informatics-guide-search">Поиск по 27 темам<input id="informatics-guide-query" type="search" placeholder="Например: маска, рекурсия, строки" value="${escapeHtml(query)}"></label><div class="informatics-guide-filters" role="group" aria-label="Фильтр тем"><button type="button" data-guide-filter="all" aria-pressed="${filter==='all'}" class="${filter==='all'?'selected':''}">Все 27</button><button type="button" data-guide-filter="part1" aria-pressed="${filter==='part1'}" class="${filter==='part1'?'selected':''}">Часть 1</button><button type="button" data-guide-filter="part2" aria-pressed="${filter==='part2'}" class="${filter==='part2'?'selected':''}">Часть 2</button></div></div><p class="informatics-guide-count">Показано ${visible.length} из ${items.length} тем · версия ЕГЭ-2027</p><div class="informatics-guide-grid">${visible.map(item=>`<details class="informatics-guide-card"><summary><span class="informatics-guide-number">${item.number}</span><span class="informatics-guide-card-title"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.kind)} · ${item.part===1?'часть 1':'часть 2'}</small></span><span class="informatics-guide-chevron" aria-hidden="true">＋</span></summary><div class="informatics-guide-body"><p class="informatics-guide-goal">${escapeHtml(item.goal)}</p><h4>Алгоритм решения</h4><ol>${item.method.map(step=>`<li>${escapeHtml(step)}</li>`).join('')}</ol><div class="informatics-guide-example"><strong>Мини-пример</strong><p>${escapeHtml(item.example)}</p><strong>Почему так</strong><p>${escapeHtml(item.solution)}</p></div><h4>Типичные ошибки</h4><ul class="informatics-guide-pitfalls">${item.pitfalls.map(p=>`<li>${escapeHtml(p)}</li>`).join('')}</ul></div></details>`).join('')||'<div class="multi-notice">Ничего не найдено. Попробуй изменить запрос.</div>'}</div>`;
        host.querySelector('#informatics-guide-query')?.addEventListener('input',event=>{query=event.target.value;const cursor=event.target.selectionStart;draw();const input=host.querySelector('#informatics-guide-query');input?.focus();input?.setSelectionRange(cursor,cursor);});
        host.querySelectorAll('[data-guide-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.guideFilter;draw();}));
      };
      draw();
    }catch(error){host.innerHTML='<div class="multi-notice notice-error" role="alert"><strong>Не удалось загрузить разборы</strong><p>'+escapeHtml(error.message)+'</p><button class="secondary-button" type="button" id="retry-informatics-guide">Повторить</button></div>';host.querySelector('#retry-informatics-guide')?.addEventListener('click',renderInformaticsGuide,{once:true});}
  }
  async function renderSubjectPractice(item) {
    const host=document.getElementById('subject-practice-bank'), count=document.getElementById('subject-bank-count');
    if(!host)return;
    try{
      const response=await fetch('./tasks_data.json',{cache:'no-cache'}); if(!response.ok)throw new Error('Не удалось загрузить банк заданий.');
      const all=await response.json(), tasks=all.filter(t=>t.subjectId===item.id&&t.sourceType==='author_original').sort((a,b)=>(a.part||1)-(b.part||1)||a.taskNumber-b.taskNumber);
      if(count)count.textContent=tasks.length+' заданий · '+tasks.filter(t=>(t.part||1)===1).length+' в части 1 · '+tasks.filter(t=>t.part===2).length+' во второй части';
      if(!tasks.length){host.innerHTML='<div class="multi-notice notice-planned"><strong>Банк ещё не опубликован</strong><p>Пока доступны официальные источники и карта тем.</p></div>';return;}
      const key='ege-plus-practice-'+item.id+'-v2'; let progress={};
      try{progress=JSON.parse(localStorage.getItem(key)||'{}')||{};}catch(_){}
      let current=0,activePythonWorker=null,runTimeout=null; const esc=escapeHtml;
      const norm=value=>String(value??'').trim().replace(/\r/g,'').replace(/\s+$/,'');
      function runPythonIsolated(code,stdin){
        return new Promise((resolve,reject)=>{
          if(activePythonWorker){activePythonWorker.terminate();activePythonWorker=null;}
          if(runTimeout)clearTimeout(runTimeout);
          const worker=new Worker('./python-runner-worker.js?v=1',{name:'ege-plus-python-runner'});activePythonWorker=worker;
          const cleanup=()=>{if(runTimeout)clearTimeout(runTimeout);runTimeout=null;worker.terminate();if(activePythonWorker===worker)activePythonWorker=null;};
          runTimeout=setTimeout(()=>{cleanup();reject(new Error('Python не успел загрузиться. Проверь подключение к интернету и повтори запуск.'));},30000);
          worker.onmessage=event=>{
            const data=event.data||{};
            if(data.ready){if(runTimeout)clearTimeout(runTimeout);runTimeout=setTimeout(()=>{cleanup();reject(new Error('Превышено время выполнения (5 секунд). Проверь бесконечный цикл или слишком большой перебор.'));},5000);return;}
            cleanup();if(data.ok)resolve(data.output);else reject(new Error(data.error||'Не удалось выполнить код.'));
          };
          worker.onerror=event=>{cleanup();reject(new Error(event.message||'Ошибка среды Python.'));};
          worker.postMessage({code:String(code).slice(0,50000),stdin:String(stdin).slice(0,100000)});
        });
      }
      function paint(){
        const task=tasks[current],saved=progress[task.externalId]||{},done=Object.keys(progress).filter(id=>progress[id]?.correct).length;
        const isCode=task.answerMode==='code',isLong=task.answerMode==='long'||(task.part===2&&!task.correctAnswer);
        let fields='';
        if(isCode){
          fields='<label for="subject-practice-answer">Код на '+esc(task.codeLanguage||'Python')+'</label><textarea id="subject-practice-answer" rows="12" spellcheck="false" autocomplete="off" placeholder="Напиши программу…">'+esc(saved.answer||'')+'</textarea><label for="subject-practice-stdin">Входные данные для запуска</label><textarea id="subject-practice-stdin" rows="4" spellcheck="false">'+esc(saved.stdin??task.codeInput??'')+'</textarea><div class="subject-practice-actions"><button class="primary-button" id="subject-run-code" type="button">▶ Запустить код</button><button class="secondary-button" id="subject-check-output" type="button">Проверить на тесте задания</button></div><p class="subject-code-hint">«Запустить код» использует введённые данные. Проверка запускает программу на контрольном входе задания, независимо от поля выше.</p><pre id="subject-code-output" class="subject-code-output" aria-live="polite">Результат выполнения появится здесь.</pre>';
        }else{
          fields='<label for="subject-practice-answer">'+(isLong?'Развёрнутый ответ':'Твой ответ')+'</label><textarea id="subject-practice-answer" rows="'+(isLong?10:3)+'" autocomplete="off" placeholder="'+(isLong?'Запиши решение по пунктам, с обоснованием…':'Введи ответ…')+'">'+esc(saved.answer||'')+'</textarea><div class="subject-practice-actions"><button class="primary-button" type="submit">'+(isLong?'Сохранить ответ и открыть критерии':'Проверить')+'</button><button class="secondary-button" id="subject-show-solution" type="button">Показать разбор</button></div>';
        }
        host.innerHTML='<div class="subject-practice-progress"><span>Задание '+(current+1)+' из '+tasks.length+'</span><span>'+done+' отмечено как верно</span></div><div class="subject-practice-card"><div class="subject-practice-meta"><span>Часть '+(task.part||1)+' · №'+task.taskNumber+'</span><span>Сложность '+(task.difficulty||2)+'/4</span></div><h3>'+esc(task.title)+'</h3><div class="subject-practice-statement">'+esc(task.statement).replace(/\n/g,'<br>')+'</div><form id="subject-practice-form">'+fields+'</form><div id="subject-practice-feedback" class="subject-practice-feedback" aria-live="polite"></div><div id="subject-practice-explanation" class="subject-practice-explanation" hidden><strong>'+(isLong?'Критерии и ориентир для самопроверки':'Разбор')+'</strong><p>'+esc(task.explanation||'Разбор пока не добавлен.')+'</p>'+(task.correctAnswer?'<p><strong>Эталон:</strong> '+esc(task.correctAnswer)+'</p>':'')+(task.rubric?'<p><strong>Критерии:</strong> '+esc(task.rubric)+'</p>':'')+'</div><div class="subject-practice-nav"><button class="secondary-button" id="subject-practice-prev" type="button" '+(current===0?'disabled':'')+'>← Предыдущее</button><button class="next-button" id="subject-practice-next" type="button">'+(current===tasks.length-1?'К первому заданию':'Следующее →')+'</button></div></div>';
        document.getElementById('subject-practice-form')?.addEventListener('submit',event=>{
          event.preventDefault();const answer=document.getElementById('subject-practice-answer').value;
          if(isLong){
            progress[task.externalId]={...(progress[task.externalId]||{}),answer,correct:false,selfAssessed:false,updatedAt:Date.now()};try{localStorage.setItem(key,JSON.stringify(progress));}catch(_){}
            const feedback=document.getElementById('subject-practice-feedback');feedback.className='subject-practice-feedback';feedback.innerHTML='Ответ сохранён. Содержание развёрнутого ответа нужно оценить по критериям. <button type="button" class="secondary-button" id="subject-self-assess">Я проверил(а) по критериям</button>';
            document.getElementById('subject-self-assess')?.addEventListener('click',()=>{progress[task.externalId]={...progress[task.externalId],correct:true,selfAssessed:true,updatedAt:Date.now()};try{localStorage.setItem(key,JSON.stringify(progress));}catch(_){}feedback.className='subject-practice-feedback is-correct';feedback.textContent='Отмечено как проверенное тобой по критериям.';});
            const box=document.getElementById('subject-practice-explanation');if(box)box.hidden=false;return;
          }
          const expected=String(task.correctAnswer??''),ok=Boolean(expected)&&norm(answer)===norm(expected);
          progress[task.externalId]={...(progress[task.externalId]||{}),answer,correct:ok,updatedAt:Date.now()};try{localStorage.setItem(key,JSON.stringify(progress));}catch(_){}
          const feedback=document.getElementById('subject-practice-feedback');feedback.className='subject-practice-feedback '+(ok?'is-correct':'is-incorrect');feedback.textContent=ok?'Верно! Ответ сохранён.':'Пока не совпало с эталоном. Проверь формат ответа или открой разбор.';
        });
        document.getElementById('subject-show-solution')?.addEventListener('click',()=>{const box=document.getElementById('subject-practice-explanation');box.hidden=!box.hidden;});
        if(isCode){
          document.getElementById('subject-run-code')?.addEventListener('click',async()=>{
            const out=document.getElementById('subject-code-output'),code=document.getElementById('subject-practice-answer').value,stdin=document.getElementById('subject-practice-stdin').value;out.textContent='Загружаем Python и запускаем программу…';
            const runButton=document.getElementById('subject-run-code');if(runButton){runButton.disabled=true;runButton.textContent='Выполняется…';}
            try{
              const result=await runPythonIsolated(code,stdin);
              out.textContent=result.length>20000?result.slice(0,20000)+'\\n… вывод сокращён …':result;
              progress[task.externalId]={...(progress[task.externalId]||{}),answer:code,stdin,output:out.textContent,correct:false,updatedAt:Date.now()};try{localStorage.setItem(key,JSON.stringify(progress));}catch(_){}
            }catch(error){out.textContent=error.message||String(error);}
            finally{const button=document.getElementById('subject-run-code');if(button){button.disabled=false;button.textContent='▶ Запустить код';}}
          });
          document.getElementById('subject-check-output')?.addEventListener('click',async()=>{
            const button=document.getElementById('subject-check-output'),out=document.getElementById('subject-code-output'),feedback=document.getElementById('subject-practice-feedback');
            const code=document.getElementById('subject-practice-answer').value,expected=norm(task.expectedOutput??task.correctAnswer??''),testInput=String(task.codeInput??'');
            if(!expected){feedback.className='subject-practice-feedback is-incorrect';feedback.textContent='Для этого задания пока не задан контрольный ответ.';return;}
            button.disabled=true;button.textContent='Проверяем…';out.textContent='Запускаем контрольный тест задания…';
            try{
              const result=await runPythonIsolated(code,testInput),ok=norm(result)===expected;
              out.textContent=result||'(программа ничего не вывела)';
              feedback.className='subject-practice-feedback '+(ok?'is-correct':'is-incorrect');
              feedback.textContent=ok?'Контрольный тест пройден. Это один тест из возможных: дополнительно проверь граничные случаи и другие входные данные.':'Контрольный тест не пройден. Сравни вывод с ожидаемым результатом и проверь алгоритм.';
              progress[task.externalId]={...(progress[task.externalId]||{}),answer:code,stdin:testInput,output:result,correct:ok,updatedAt:Date.now()};try{localStorage.setItem(key,JSON.stringify(progress));}catch(_){}
            }catch(error){out.textContent=error.message||String(error);feedback.className='subject-practice-feedback is-incorrect';feedback.textContent='Проверка не завершилась. Исправь ошибку или попробуй снова.';}
            finally{const check=document.getElementById('subject-check-output');if(check){check.disabled=false;check.textContent='Проверить на тесте задания';}}
          });
        }
        document.getElementById('subject-practice-prev')?.addEventListener('click',()=>{current=Math.max(0,current-1);paint();});
        document.getElementById('subject-practice-next')?.addEventListener('click',()=>{current=current===tasks.length-1?0:current+1;paint();});
      }
      paint();
    }catch(error){host.innerHTML='<div class="multi-notice notice-error"><strong>Не удалось загрузить упражнения</strong><p>'+escapeHtml(error.message)+'</p></div>';}
  }
  async function init() {
    const catalogOrHome = ['subjects','home'].includes(PAGE);
    try {
      const response = await fetch('./subjects.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error('Не удалось загрузить каталог предметов.');
      registry = await response.json(); flat = flattenSubjects(registry);
      if (PAGE === 'subjects') { renderSubjectsCatalog(); return; }
      if (PAGE === 'home') { renderHomePreview(registry); return; }
      const item = context(); if (!item) return;
      if (PAGE === 'subject') { renderSubjectDashboard(item); return; }
      if (item.id !== 'math_basic') {
        renderGenericSection(item, PAGE);
        if (PAGE === 'theory' && item.id === 'informatics') renderInformaticsGuide();
      }
    } catch (error) {
      const hostId = PAGE === 'subjects' ? 'subjects-catalog'
        : PAGE === 'subject' ? 'subject-dashboard'
        : PAGE === 'home' ? 'home-subject-preview-grid'
        : 'multi-subject-page-content';
      const host = document.getElementById(hostId);
      if (host) {
        host.innerHTML = `<div class="multi-notice notice-error" role="alert"><strong>Не удалось загрузить каталог предметов</strong><p>Проверь подключение к интернету и попробуй ещё раз. Данные предметов не удалены.</p><button class="secondary-button" id="retry-subject-catalog" type="button">Повторить загрузку</button></div>`;
        document.getElementById('retry-subject-catalog')?.addEventListener('click', () => {
          const button = document.getElementById('retry-subject-catalog');
          if (button) { button.disabled = true; button.textContent = 'Загружаем…'; }
          init();
        }, { once: true });
      }
    }
  }
  function setupNavigation() {
    // Progress/reset controls belong only to the local base-math trainer for now.
    // Other subject routes must not suggest that they already store personal progress.
    if (PAGE !== 'home' && PAGE !== 'topics' && PAGE !== 'study') {
      document.querySelector('.topbar-right .saved-status')?.remove();
      document.querySelector('#reset-progress')?.remove();
    } else if (activeId && activeId !== 'math_basic') {
      document.querySelector('.topbar-right .saved-status')?.remove();
      document.querySelector('#reset-progress')?.remove();
    }
    document.querySelectorAll('.topnav [data-nav-page]').forEach((link) => {
      const targetPage = link.dataset.navPage;
      if (targetPage === 'subjects') link.href = './subjects.html';
      else if (targetPage === 'home') link.href = './index.html';
      else if (activeId && URLS[targetPage]) link.href = routeHref(targetPage, activeId);
    });
  }
  // Hide the legacy mathematics markup before the async subject registry arrives,
  // so non-math subjects never briefly flash math tasks while loading.
  if (activeId && activeId !== 'math_basic' && ['topics','study','theory','official'].includes(PAGE)) {
    document.body.dataset.multiSubjectPage = 'true';
    const scaffold = document.getElementById('multi-subject-page-content');
    if (scaffold) { scaffold.hidden = false; scaffold.innerHTML = '<div class="multi-notice"><strong>Загружаем выбранный предмет…</strong><p>Подготавливаем его темы и официальные источники.</p></div>'; }
  }
  setupNavigation();
  setupGlobalQuickSearch();
  // Register offline support on every page, including the home page and subject catalog.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  document.addEventListener('DOMContentLoaded', init);
})();

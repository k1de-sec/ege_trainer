(() => {
  'use strict';
  const panel = document.getElementById('resume-panel');
  // The legacy resume panel reads only base-math progress. Other subjects have their own progress UI.
  if (!panel || document.body.dataset.multiSubjectPage === 'true') return;
  const key = 'ege-trainer-progress-v3-math_basic';
  const title = document.getElementById('resume-title');
  const description = document.getElementById('resume-description');
  const link = document.getElementById('resume-link');
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    const solved = Array.isArray(saved.solved) ? saved.solved.length : 0;
    const currentId = typeof saved.currentId === 'string' ? saved.currentId : '';
    const mode = saved.mode === 'exam' ? 'пробный вариант' : saved.mode === 'warmup' ? 'быструю разминку' : saved.mode === 'random' ? 'смешанную подборку' : 'тренировку';
    if (solved > 0 || currentId || (Array.isArray(saved.activeTaskIds) && saved.activeTaskIds.length)) {
      panel.hidden = false;
      title.textContent = currentId ? 'Продолжить с последнего задания?' : 'Подготовка уже начата';
      description.textContent = solved + ' заданий отмечено решёнными. ' + (currentId ? 'Последняя сессия: ' + mode + '.' : 'Можно продолжить тренировку.');
      link.textContent = currentId ? 'Вернуться к заданию →' : 'Открыть тренировку →';
      link.href = './self-study.html#topic-workspace';
    }
  } catch (_) { /* Local progress is optional. */ }
})();

const CACHE_NAME = 'ege-trainer-web-v25-official-only';
const APP_SHELL = [
  './', './index.html', './subjects.html', './subject.html', './topics.html', './self-study.html', './theory.html', './official.html',
  './styles.css', './design-refresh.css', './app.js', './multi-exam.js', './progress-dashboard.js', './subjects.json', './tasks_data.json', './fipi_links.json', './official_exam_sources.json', './informatics_guide.json', './python-runner-worker.js',
  './manifest.webmanifest', './favicon.svg',
  './assets/diagrams/grid-cut.svg', './assets/diagrams/right-triangle.svg', './assets/diagrams/pyramid.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.ok) {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        }
        return response;
      });
    }).catch(() => caches.match(event.request, { ignoreSearch: true }).then((cached) => {
      // Never serve index.html as a fallback for another route: each section is a real page.
      return cached || new Response(
        '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Нет соединения</title><body style="font:16px system-ui;padding:2rem"><h1>Страница пока недоступна</h1><p>Подключись к интернету и обнови страницу. Разделы сайта открываются отдельными страницами.</p><p><a href="./index.html">Вернуться на главную</a></p></body></html>',
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }))
  );
});

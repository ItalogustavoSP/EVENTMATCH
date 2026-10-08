const CACHE_NAME = 'la-vie-cache-v2';

const APP_PATH = new URL('.', self.registration.scope).pathname;
const asset = (path) => new URL(path, self.registration.scope).href;

const urlsToCache = [
  asset('./'),
  asset('./index.html'),
  asset('./style.css'),
  asset('./script.js'),
  asset('./firebase-config.js'),
  asset('./confirmar-presenca.html'),
  asset('./manifest.json'),
  asset('./404.html')
];

// Instalação do Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .catch(error => console.warn('Cache inicial parcial:', error))
  );
  self.skipWaiting();
});

// Interceptação de requisições
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);

  // Nunca interceptar Firebase, APIs ou outros recursos externos.
  if (
    requestUrl.origin !== self.location.origin ||
    requestUrl.pathname.includes('/firestore') ||
    requestUrl.pathname.includes('/auth') ||
    requestUrl.hostname.includes('googleapis.com')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        if (!response || !response.ok) return response;

        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      });
    }).catch(() => {
      if (requestUrl.pathname.endsWith('.html')) {
        return caches.match(asset('./404.html'));
      }
      return new Response('Offline - Verifique sua conexão.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    })
  );
});

// Ativação e limpeza de versões antigas
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// Notificações push
self.addEventListener('push', event => {
  const options = {
    body: event.data?.text() || 'Nova atualização no La Vie Casamentos',
    icon: asset('./assets/icon-192.png'),
    badge: asset('./assets/icon-72.png'),
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification('La Vie Casamentos', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(asset('./')));
});
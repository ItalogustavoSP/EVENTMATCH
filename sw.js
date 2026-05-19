const CACHE_NAME = 'la-vie-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/firebase-config.js',
  '/confirmar.html',
  'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

// Instalação do Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache aberto');
        return cache.addAll(urlsToCache);
      })
  );
});

// Interceptação de requisições
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache first, then network
        if (response) {
          return response;
        }
        return fetch(event.request).then(
          networkResponse => {
            // Não armazenar em cache requisições de API
            if (!event.request.url.includes('/firestore') && 
                !event.request.url.includes('/auth')) {
              return caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, networkResponse.clone());
                return networkResponse;
              });
            }
            return networkResponse;
          }
        );
      })
  );
});

// Atualização do cache
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Notificações push (opcional)
self.addEventListener('push', event => {
  const options = {
    body: event.data.text(),
    icon: 'assets/icon-192.png',
    badge: 'assets/icon-72.png',
    vibrate: [200, 100, 200],
    actions: [
      { action: 'ver', title: 'Ver agora' },
      { action: 'fechar', title: 'Fechar' }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('La Vie Casamentos', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'ver') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});
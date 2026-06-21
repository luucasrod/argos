/**
 * Argos Service Worker
 * Estratégia: Network-first para navegação, Cache-first para assets estáticos.
 * Fallback offline quando sem conexão.
 */

const CACHE_NAME = 'argos-cache-v3';
const OFFLINE_URL = '/offline.html';
const SHELL_URL = '/';

// Assets para pré-cachear na instalação
const PRECACHE_URLS = [SHELL_URL, OFFLINE_URL];

/* ─── INSTALL ─── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // Ativa imediatamente sem esperar a aba anterior fechar
  self.skipWaiting();
});

/* ─── ACTIVATE ─── */
self.addEventListener('activate', (event) => {
  // Remove caches antigos
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  // Assume controle imediato de todos os clientes
  self.clients.claim();
});

/* ─── FETCH ─── */
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Ignora requisições não-GET
  if (request.method !== 'GET') return;

  // Ignora API Anthropic (sempre precisa de rede)
  if (request.url.includes('api.anthropic.com')) return;

  // Ignora extensões do browser
  if (request.url.startsWith('chrome-extension://')) return;

  // ─── Requisições de navegação (HTML) ───
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Salva no cache se bem-sucedido
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(SHELL_URL, clone));
          }
          return response;
        })
        .catch(() =>
          // Offline: serve o shell cacheado ou a página offline
          caches.match(SHELL_URL).then((cached) => cached || caches.match(OFFLINE_URL))
        )
    );
    return;
  }

  // ─── Assets estáticos (JS, CSS, imagens, fontes) ───
  // Cache-first: rápido e funciona offline
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (!response.ok || response.type === 'opaque') return response;

          // Só cacheia arquivos do próprio domínio
          const url = new URL(request.url);
          if (url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }

          return response;
        })
        .catch(() => caches.match(OFFLINE_URL));
    })
  );
});

/* ─── PUSH NOTIFICATIONS (Fase 3) ─── */
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Argos', {
      body: data.body || '',
      icon: '/assets/icon.png',
      badge: '/assets/favicon.png',
      tag: data.tag || 'argos-notification',
      data: data,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});

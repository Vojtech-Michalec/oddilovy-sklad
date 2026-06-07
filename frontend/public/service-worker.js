/**
 * service-worker.js — Offline podpora pro Oddílový sklad.
 *
 * Strategie:
 *   - HTML stránky:       vždy ze sítě (aby se nenačetla stará verze aplikace)
 *   - Statické assety:    Cache First (JS, CSS, obrázky — mění se jen při novém buildu)
 *   - API data (GET):     Network First → při offline servíruj z cache + pošli zprávu do Reactu
 *   - Ostatní API:        Vždy síť (POST, PATCH — mutace nesmí jít z cache)
 *
 * Cachovaná API data (co má smysl číst offline):
 *   /api/equipment            — seznam vybavení
 *   /api/borrowings/my-history — moje výpůjčky
 *   /api/locations            — seznam skladů
 *
 * Komunikace se SW → React:
 *   Když SW servíruje z cache (offline), pošle postMessage:
 *   { type: 'OFFLINE_CACHE', path: '/api/equipment' }
 *   React tuto zprávu zachytí v OfflineNotifier a zobrazí upozornění.
 */

const APP_CACHE  = 'sklad-shell-v2';   // statické assety (JS, CSS, ikony)
const API_CACHE  = 'sklad-api-v2';     // cachovaná API data

// Backend hostname — stejný v celém projektu
const BACKEND_HOST = 'sklad-backend.skladbackend.workers.dev';

// Pouze tyto GET endpointy se ukládají do cache pro offline použití.
// Mutace (POST /borrowings/return apod.) záměrně NEJSOU v seznamu.
const OFFLINE_CACHEABLE_PATHS = [
  '/api/equipment',
  '/api/borrowings/my-history',
  '/api/locations',
];

/** Vrátí true, pokud je request na náš backend a na cacheable endpoint. */
function isCacheable(url) {
  if (url.hostname !== BACKEND_HOST) return false;
  return OFFLINE_CACHEABLE_PATHS.some(path => url.pathname === path);
}

/** Vrátí true, pokud je request na náš backend (jakýkoliv endpoint). */
function isBackendRequest(url) {
  return url.hostname === BACKEND_HOST;
}

// ---------------------------------------------------------------------------
// INSTALL: nainstaluj SW (bez precachování HTML — to nechceme cachovat)
// ---------------------------------------------------------------------------
self.addEventListener('install', (event) => {
  // skipWaiting: nový SW se aktivuje okamžitě, nečeká na zavření tabs
  event.waitUntil(self.skipWaiting());
});

// ---------------------------------------------------------------------------
// ACTIVATE: vymaž staré verze cache (APP_CACHE a API_CACHE s jiným číslem verze)
// ---------------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== APP_CACHE && key !== API_CACHE)
          .map(key => {
            console.log('[SW] Mažu starou cache:', key);
            return caches.delete(key);
          })
      ))
      .then(() => self.clients.claim()) // okamžitě převezmi kontrolu nad všemi tabs
  );
});

// ---------------------------------------------------------------------------
// FETCH: hlavní logika — každý request ze stránky prochází přes tuto funkci
// ---------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // --- 0. Ignoruj non-HTTP requesty (chrome-extension://, moz-extension://, ...) ---
  // Bez toho by SW házel chybu "Request scheme is unsupported" při rozšíření prohlížeče.
  if (!url.protocol.startsWith('http')) return;

  // --- 1. HTML stránky: vždy ze sítě ---
  // Důvod: cachování index.html způsobovalo, že se po deployi načetla stará verze.
  // Pokud síť selže a máme cached HTML jako zálohu, použijeme ho.
  if (event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // --- 2. Cacheable API endpointy: Network First → Cache fallback ---
  if (isCacheable(url) && event.request.method === 'GET') {
    event.respondWith(handleCacheableApi(event.request, url));
    return;
  }

  // --- 3. Ostatní requesty na backend: vždy síť (POST, PATCH, auth, ...) ---
  // Tyto requesty záměrně nekachujeme.
  if (isBackendRequest(url)) {
    event.respondWith(fetch(event.request));
    return;
  }

  // --- 4. Statické assety (JS, CSS, obrázky): Cache First ---
  // Vite přidává hash do názvů souborů, takže stará cache se nikdy nezobrazí.
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Cachuj pouze úspěšné GET odpovědi
        if (event.request.method === 'GET' && response.status === 200) {
          const clone = response.clone();
          caches.open(APP_CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

// ---------------------------------------------------------------------------
// handleCacheableApi: Network First s Cache fallback
// ---------------------------------------------------------------------------
async function handleCacheableApi(request, url) {
  try {
    // Zkus síť (vždy preferujeme čerstvá data)
    const response = await fetch(request);

    if (response.ok) {
      // Ulož do cache pro případ, že uživatel bude offline příště
      const clone = response.clone();
      const cache = await caches.open(API_CACHE);
      await cache.put(request, clone);
      console.log('[SW] Data uložena do cache:', url.pathname);
    }

    return response;

  } catch (networkError) {
    // Síť selhala (offline) → zkus cache
    console.log('[SW] Offline, zkouším cache pro:', url.pathname);
    const cached = await caches.match(request);

    if (cached) {
      // Notifikuj React aplikaci, že servírujeme stará data
      notifyClientsOffline(url.pathname);
      console.log('[SW] Servíruji z cache:', url.pathname);
      return cached;
    }

    // Ani cache nemáme → vrať chybu ve formátu JSON (ne HTML stránku 503)
    console.warn('[SW] Žádná cache pro:', url.pathname);
    return new Response(
      JSON.stringify({ error: 'Jste offline a data nebyla ještě uložena do mezipaměti.' }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// ---------------------------------------------------------------------------
// notifyClientsOffline: pošle zprávu všem otevřeným tabs React aplikace
// Tato zpráva se zachytí v komponentě OfflineNotifier v App.tsx.
// ---------------------------------------------------------------------------
async function notifyClientsOffline(path) {
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(client => {
    client.postMessage({ type: 'OFFLINE_CACHE', path });
  });
}

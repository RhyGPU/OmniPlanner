/**
 * OmniPlanner service worker — offline-first shell cache.
 *
 * STRATEGY: Network-first with cache fallback for same-origin requests.
 *   1. Try the network.
 *   2. Cache every successful same-origin GET response.
 *   3. When offline, serve from cache.
 *
 * WHAT IS CACHED:
 *   Everything served from the same origin: HTML shell, JS bundles, CSS,
 *   fonts, and icons. External AI API calls (OpenAI, Anthropic, Gemini,
 *   OpenRouter) are cross-origin and are never intercepted.
 *
 * WHAT IS NOT CACHED:
 *   - Cross-origin requests (AI provider APIs, external fonts/CDN).
 *   - Non-GET requests (mutations, POST etc.).
 *
 * OFFLINE BEHAVIOUR:
 *   The app shell (index.html + JS + CSS) is cached on first visit and served
 *   offline on subsequent visits. All planner data is stored in IndexedDB and
 *   is always available offline. AI features require network.
 *
 * CACHE VERSIONING:
 *   Bump CACHE_NAME on each release to force a cache refresh. Old caches are
 *   deleted during the activate event.
 */

const CACHE_NAME = 'omniplanner-shell-v1';

// Assets to pre-cache on install so the app shell is available immediately
// after the first online visit (even before any navigations are cached).
const PRECACHE_ASSETS = [
  './',
  './favicon.ico',
  './manifest.json',
];

// ---------------------------------------------------------------------------
// Install: pre-cache shell assets
// ---------------------------------------------------------------------------

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

// ---------------------------------------------------------------------------
// Activate: clean up obsolete caches
// ---------------------------------------------------------------------------

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ---------------------------------------------------------------------------
// Fetch: network-first, cache fallback
// ---------------------------------------------------------------------------

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Only intercept same-origin requests — never touch AI API calls
  if (url.origin !== self.location.origin) return;

  // Skip chrome-extension and other non-http(s) schemes
  if (!url.protocol.startsWith('http')) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Cache successful responses for offline use
        if (networkResponse.ok) {
          const clone = networkResponse.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      })
      .catch(() =>
        // Network unavailable — serve from cache
        caches
          .match(event.request)
          .then(
            (cached) =>
              cached ||
              new Response(
                'OmniPlanner is offline. Open the app while connected to the internet once to enable offline use.',
                {
                  status: 503,
                  headers: { 'Content-Type': 'text/plain' },
                },
              ),
          ),
      ),
  );
});

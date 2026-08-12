/*
  Exhibition Platform — Stage 12C66C6C8C1
  Persistent asset cache for public Storage delivery across Viewer/Admin navigation.
  Database/auth/API requests are never cached here.

  C6C8C1 deliberately uses a stable cache name. During activation, entries from older
  exhibition-platform asset caches are copied locally into the stable cache before the
  old cache is removed, so deploying a new application stage does not force assets to
  be downloaded from Supabase again.
*/
const CACHE_PREFIX = "exhibition-platform-assets-";
const CACHE_NAME = "exhibition-platform-assets-v1";
const STORAGE_PUBLIC_MARKER = "/storage/v1/object/public/";
const CACHEABLE_EXTENSIONS = /\.(?:glb|gltf|avif|webp|png|jpe?g|ktx2)(?:$|[?#])/i;
const inFlight = new Map();
let statsMemo = null;
let statsMemoAt = 0;
let statsDirty = true;

function isCacheableAssetRequest(request) {
  if (!request || request.method !== "GET") return false;
  let url;
  try { url = new URL(request.url); } catch (_error) { return false; }
  if (!/^https?:$/.test(url.protocol)) return false;
  if (!CACHEABLE_EXTENSIONS.test(url.pathname + url.search)) return false;
  if (url.href.includes(STORAGE_PUBLIC_MARKER)) return true;
  return url.origin === self.location.origin;
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

async function migrateLegacyAssetCaches() {
  const names = await caches.keys();
  const target = await caches.open(CACHE_NAME);
  for (const name of names) {
    if (!name.startsWith(CACHE_PREFIX) || name === CACHE_NAME) continue;
    try {
      const legacy = await caches.open(name);
      const requests = await legacy.keys();
      for (const request of requests) {
        const exists = await target.match(request);
        if (exists) continue;
        const response = await legacy.match(request);
        if (response) {
          try { await target.put(request, response.clone()); } catch (_error) {}
        }
      }
    } catch (_error) {}
    await caches.delete(name);
  }
  statsDirty = true;
}

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await migrateLegacyAssetCaches();
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (!isCacheableAssetRequest(request)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    const key = request.url;
    let networkPromise = inFlight.get(key);
    if (!networkPromise) {
      networkPromise = (async () => {
        const response = await fetch(request);
        if (response && (response.ok || response.type === "opaque")) {
          try {
            await cache.put(request, response.clone());
            statsDirty = true;
          } catch (_error) {}
        }
        return response;
      })();
      inFlight.set(key, networkPromise);
    }

    try {
      const response = await networkPromise;
      return response.clone();
    } finally {
      self.setTimeout(() => inFlight.delete(key), 800);
    }
  })());
});

async function getCacheStats(force) {
  const now = Date.now();
  if (!force && !statsDirty && statsMemo && now - statsMemoAt < 60000) return Object.assign({}, statsMemo);
  const cache = await caches.open(CACHE_NAME);
  const requests = await cache.keys();
  let knownBytes = 0;
  for (const request of requests) {
    const response = await cache.match(request);
    if (!response) continue;
    knownBytes += Number(response.headers.get("content-length")) || 0;
  }
  statsMemo = { cacheName: CACHE_NAME, entries: requests.length, knownBytes };
  statsMemoAt = now;
  statsDirty = false;
  return Object.assign({}, statsMemo);
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  const port = event.ports && event.ports[0];
  if (data.type === "EXHIBITION_ASSET_CACHE_STATS") {
    event.waitUntil(getCacheStats(data.force === true).then((stats) => { if (port) port.postMessage(stats); }));
  } else if (data.type === "EXHIBITION_ASSET_CACHE_CLEAR") {
    event.waitUntil(caches.delete(CACHE_NAME).then(async () => {
      await caches.open(CACHE_NAME);
      statsMemo = { cacheName: CACHE_NAME, entries: 0, knownBytes: 0 };
      statsMemoAt = Date.now();
      statsDirty = false;
      if (port) port.postMessage({ ok: true, cacheName: CACHE_NAME, entries: 0, knownBytes: 0 });
    }));
  } else if (data.type === "EXHIBITION_ASSET_CACHE_EVICT" && data.url) {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.delete(String(data.url))).then((deleted) => {
      statsDirty = true;
      if (port) port.postMessage({ ok: true, deleted: !!deleted });
    }));
  }
});

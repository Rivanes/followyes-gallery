/*
  Exhibition Platform — Stage 12C66C6C8C
  Persistent asset cache for public Storage delivery across Viewer/Admin navigation.
  Database/auth/API requests are never cached here.
*/
const CACHE_PREFIX = "exhibition-platform-assets-";
const CACHE_NAME = "exhibition-platform-assets-c6c8c-20260812";
const STORAGE_PUBLIC_MARKER = "/storage/v1/object/public/";
const CACHEABLE_EXTENSIONS = /\.(?:glb|gltf|avif|webp|png|jpe?g|ktx2)(?:$|[?#])/i;
const inFlight = new Map();

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

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((name) => {
      if (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) return caches.delete(name);
      return Promise.resolve(false);
    }));
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
          try { await cache.put(request, response.clone()); } catch (_error) {}
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

async function getCacheStats() {
  const cache = await caches.open(CACHE_NAME);
  const requests = await cache.keys();
  let knownBytes = 0;
  for (const request of requests) {
    const response = await cache.match(request);
    if (!response) continue;
    const value = Number(response.headers.get("content-length")) || 0;
    knownBytes += value;
  }
  return { cacheName: CACHE_NAME, entries: requests.length, knownBytes };
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  const port = event.ports && event.ports[0];
  if (data.type === "EXHIBITION_ASSET_CACHE_STATS") {
    event.waitUntil(getCacheStats().then((stats) => { if (port) port.postMessage(stats); }));
  } else if (data.type === "EXHIBITION_ASSET_CACHE_CLEAR") {
    event.waitUntil(caches.delete(CACHE_NAME).then(async () => {
      await caches.open(CACHE_NAME);
      if (port) port.postMessage({ ok: true, cacheName: CACHE_NAME, entries: 0, knownBytes: 0 });
    }));
  } else if (data.type === "EXHIBITION_ASSET_CACHE_EVICT" && data.url) {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.delete(String(data.url))).then((deleted) => {
      if (port) port.postMessage({ ok: true, deleted: !!deleted });
    }));
  }
});

/* Exhibition Platform — Stage 12C66C6C8C5 persistent asset-cache bootstrap. */
const SERVICE_WORKER_URL = new URL("../../asset-cache-sw.js?v=stage12c66c6c8c5_exhibition_residency_20260812", import.meta.url);
let registrationPromise = null;
let statusMemo = null;
let statusMemoAt = 0;

function waitForController(timeoutMs = 1800) {
  if (!navigator.serviceWorker || navigator.serviceWorker.controller) return Promise.resolve(navigator.serviceWorker && navigator.serviceWorker.controller);
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
      resolve(navigator.serviceWorker.controller || null);
    };
    const onChange = () => finish();
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    window.setTimeout(finish, timeoutMs);
  });
}

export async function registerExhibitionAssetCache() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) {
    return { supported: false, controlled: false, registration: null };
  }
  if (!registrationPromise) {
    registrationPromise = (async () => {
      const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL.href);
      await navigator.serviceWorker.ready;
      await waitForController();
      return { supported: true, controlled: !!navigator.serviceWorker.controller, registration };
    })().catch((error) => {
      console.warn("Asset cache service worker unavailable:", error);
      return { supported: true, controlled: false, registration: null, error: error && error.message ? error.message : String(error) };
    });
  }
  return registrationPromise;
}

function sendWorkerMessage(type, payload = {}) {
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return Promise.resolve(null);
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => resolve(null), 1500);
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timer);
      resolve(event.data || null);
    };
    navigator.serviceWorker.controller.postMessage(Object.assign({ type }, payload), [channel.port2]);
  });
}

export async function getExhibitionAssetCacheStatus(options = {}) {
  const force = options && options.force === true;
  const now = Date.now();
  if (!force && statusMemo && now - statusMemoAt < 60000) return Object.assign({}, statusMemo);
  const registration = await registerExhibitionAssetCache();
  const stats = registration.controlled ? await sendWorkerMessage("EXHIBITION_ASSET_CACHE_STATS", { force }) : null;
  statusMemo = Object.assign({
    supported: !!registration.supported,
    controlled: !!registration.controlled,
    entries: 0,
    knownBytes: 0
  }, stats || {});
  statusMemoAt = now;
  return Object.assign({}, statusMemo);
}

export async function clearExhibitionAssetCache() {
  await registerExhibitionAssetCache();
  statusMemo = null;
  statusMemoAt = 0;
  return sendWorkerMessage("EXHIBITION_ASSET_CACHE_CLEAR");
}

export async function evictExhibitionAssetCacheUrl(url) {
  if (!url) return null;
  await registerExhibitionAssetCache();
  statusMemo = null;
  statusMemoAt = 0;
  return sendWorkerMessage("EXHIBITION_ASSET_CACHE_EVICT", { url: String(url) });
}

export async function getExhibitionAssetDeliveryStats() {
  await registerExhibitionAssetCache();
  const stats = await sendWorkerMessage("EXHIBITION_ASSET_DELIVERY_STATS");
  return Object.assign({
    schema: "exhibition-storage-delivery-stats.v1",
    startedAt: 0,
    assetRequests: 0,
    cacheHits: 0,
    networkFetches: 0,
    coalescedRequests: 0,
    networkKnownBytes: 0,
    supabaseNetworkFetches: 0,
    supabaseNetworkKnownBytes: 0,
    byCategory: {},
    lastNetworkUrl: null,
    lastNetworkAt: 0
  }, stats || {});
}

export async function resetExhibitionAssetDeliveryStats() {
  await registerExhibitionAssetCache();
  return sendWorkerMessage("EXHIBITION_ASSET_DELIVERY_RESET");
}

if (typeof window !== "undefined") {
  window.ExhibitionAssetCache = {
    register: registerExhibitionAssetCache,
    getStatus: getExhibitionAssetCacheStatus,
    clear: clearExhibitionAssetCache,
    evict: evictExhibitionAssetCacheUrl,
    getDeliveryStats: getExhibitionAssetDeliveryStats,
    resetDeliveryStats: resetExhibitionAssetDeliveryStats
  };
}

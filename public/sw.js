const CACHE_NAME = "smart-inventory-shell-v4";
const FALLBACK_HTML_URLS = ["/", "/index.html"];
const STATIC_FALLBACKS = ["/favicon.svg"];

function normalizeSameOriginUrl(input) {
  try {
    const url = new URL(input, self.location.origin);
    if (url.origin !== self.location.origin) return null;
    if (url.pathname.startsWith("/api/")) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

async function discoverAppShellUrls() {
  const urls = new Set([...FALLBACK_HTML_URLS, ...STATIC_FALLBACKS]);

  try {
    const response = await fetch("/", { cache: "no-store" });
    if (!response.ok) return [...urls];

    const html = await response.text();
    const assetPattern = /(?:src|href)=["']([^"']+)["']/g;
    const modulePattern = /(?:import|url)\(["']([^"']+)["']\)/g;
    const candidates = [
      ...html.matchAll(assetPattern),
      ...html.matchAll(modulePattern)
    ];

    for (const match of candidates) {
      const normalized = normalizeSameOriginUrl(match[1]);
      if (!normalized) continue;
      if (normalized.startsWith("data:")) continue;
      urls.add(normalized);
    }
  } catch {
    // Ignore network failures here. The fallback shell still works if it was cached earlier.
  }

  return [...urls];
}

async function cacheUrls(cache, urls) {
  await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (response && response.ok) {
          await cache.put(url, response.clone());
        }
      } catch {
        // Ignore individual asset failures so one missing file does not block install.
      }
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cacheUrls(cache, await discoverAppShellUrls());
    })()
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => (key === CACHE_NAME ? Promise.resolve() : caches.delete(key))));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put("/index.html", networkResponse.clone()).catch(() => {});
            cache.put("/", networkResponse.clone()).catch(() => {});
          }
          return networkResponse;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match("/index.html")) || (await cache.match("/")) || caches.match("/");
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(request);
      if (cachedResponse) {
        event.waitUntil(
          fetch(request)
            .then((response) => {
              if (response && response.ok) {
                cache.put(request, response.clone()).catch(() => {});
              }
            })
            .catch(() => {})
        );
        return cachedResponse;
      }

      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok) {
          cache.put(request, networkResponse.clone()).catch(() => {});
        }
        return networkResponse;
      } catch {
        return cachedResponse || Response.error();
      }
    })()
  );
});

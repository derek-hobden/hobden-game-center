/* Hobden Game Center — offline shell service worker */
const CACHE = "hobden-game-center-v4";
const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/icons/icon-32.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

function isAppShellPath(pathname) {
  return pathname === "/" || pathname === "";
}

async function handleNavigation(req) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(CACHE);
      const url = new URL(req.url);
      // Keep "/" as the real home shell — never overwrite it with a deep-link page.
      if (isAppShellPath(url.pathname)) {
        await cache.put("/", res.clone());
      }
      await cache.put(req, res.clone());
    }
    return res;
  } catch {
    const exact = await caches.match(req);
    if (exact) return exact;

    const url = new URL(req.url);
    if (!isAppShellPath(url.pathname)) {
      return Response.redirect(new URL("/", url.origin), 303);
    }

    const shell = await caches.match("/");
    if (shell) return shell;
    return new Response(
      "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Offline</title></head><body style=\"font-family:sans-serif;padding:2rem;text-align:center\"><p>You're offline. Open Hobden Game Center once while online to play later.</p><p><a href=\"/\">Try home</a></p></body></html>",
      {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      },
    );
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigation: network-first, then the exact cached page, then the home shell.
  if (req.mode === "navigate") {
    event.respondWith(handleNavigation(req));
    return;
  }

  // Static assets: stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetching = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetching;
    }),
  );
});

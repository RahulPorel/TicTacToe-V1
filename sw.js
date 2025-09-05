// A unique name for our cache
const CACHE_NAME = "tictactoe-v1";

// The files we want to cache for offline use
const urlsToCache = ["/", "/index.html", "/style.css", "/app.js"];

// Install event: fires when the service worker is first installed.
self.addEventListener("install", (event) => {
  // We wait until the cache is opened and all our files are added to it.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Opened cache");
      return cache.addAll(urlsToCache);
    })
  );
});

// Fetch event: fires for every network request the page makes.
self.addEventListener("fetch", (event) => {
  event.respondWith(
    // Check if the request is already in our cache.
    caches.match(event.request).then((response) => {
      // If we have a cached response, return it.
      if (response) {
        return response;
      }
      // If not in cache, make the network request.
      return fetch(event.request);
    })
  );
});

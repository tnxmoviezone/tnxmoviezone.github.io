/* TNxMovieZone — new movie alerts + auto-update */
var CHECK_MS = 30 * 60 * 1000;

var IMG_CACHE = 'tmdb-img-v1';

self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return k === IMG_CACHE ? null : caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* TMDB posters/backdrops: cache-first (their URLs are immutable), so repeat visits load images instantly */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var u;
  try { u = new URL(e.request.url); } catch (err) { return; }
  if (u.hostname !== 'image.tmdb.org') return;
  e.respondWith(
    caches.open(IMG_CACHE).then(function (cache) {
      return cache.match(e.request).then(function (hit) {
        if (hit) return hit;
        return fetch(e.request).then(function (res) {
          if (res && (res.status === 200 || res.type === 'opaque')) {
            cache.put(e.request, res.clone());
            cache.keys().then(function (keys) {
              if (keys.length > 150) {
                keys.slice(0, keys.length - 150).forEach(function (k) { cache.delete(k); });
              }
            });
          }
          return res;
        });
      });
    })
  );
});

function getKnown() {
  return self.registration.storage ? Promise.resolve([]) : Promise.resolve([]);
}

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data.json(); } catch (err) {}
  e.waitUntil(self.registration.showNotification(d.title || 'TNxMovieZone', {
    body: d.body || 'Notun movie add hoise! 🎬',
    icon: 'logo/logo.png',
    badge: 'logo/logo.png',
    data: { url: d.url || '/' }
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(clients.openWindow(url));
});

/* periodic check for new movies (when page triggers) */
self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'check-new') {
    checkNewMovies(e.data.knownIds || []);
  }
});

function checkNewMovies(knownIds) {
  fetch('data/movies.json?ts=' + Date.now()).then(function (r) { return r.json(); })
    .then(function (movies) {
      var fresh = movies.filter(function (m) { return knownIds.indexOf(String(m.id)) === -1; });
      if (fresh.length && Notification.permission === 'granted') {
        var m = fresh[0];
        var extra = fresh.length > 1 ? ' (+' + (fresh.length - 1) + ' more)' : '';
        self.registration.showNotification('🎬 ' + m.title + extra, {
          body: 'Notun movie add hoise — ekhoni dekho!',
          icon: m.poster_url || 'logo/logo.png',
          data: { url: 'movie.html?id=' + encodeURIComponent(m.id) }
        });
      }
      /* report back all current ids */
      return self.clients.matchAll().then(function (clients) {
        clients.forEach(function (c) {
          c.postMessage({ type: 'ids', ids: movies.map(function (m) { return String(m.id); }) });
        });
      });
    }).catch(function () {});
}

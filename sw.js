// Service worker for Jeff's Junk dashboard — receives web push notifications
// and shows them, even when the app is closed. Registered from app.js.
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; }
  catch (err) { data = { title: "Jeff's Junk", body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(data.title || "Jeff's Junk", {
    body: data.body || '',
    icon: 'assets/app-icon-192.png',
    badge: 'assets/app-icon-192.png',
    data: { url: data.url || './' }
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) { if ('focus' in list[i]) return list[i].focus(); }
    return clients.openWindow((e.notification.data && e.notification.data.url) || './');
  }));
});

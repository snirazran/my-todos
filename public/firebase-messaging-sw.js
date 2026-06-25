/* global importScripts, firebase, clients */
importScripts(
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
);
importScripts(
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js',
);

const params = new URL(self.location).searchParams;
const firebaseConfig = {
  apiKey: params.get('apiKey'),
  projectId: params.get('projectId'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
};

if (firebaseConfig.apiKey) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const n = payload.notification || {};
    const data = payload.data || {};
    if (data.type === 'task_sync') {
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((list) => {
          list.forEach((client) => {
            client.postMessage({
              type: 'task_sync',
              changedAt: data.changedAt,
            });
          });
        });
      return;
    }
    self.registration.showNotification(n.title || data.title || 'Frogress', {
      body: n.body || data.body || '',
      icon: '/192x192.png',
      badge: '/192x192.png',
      data,
    });
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.path) || '/';
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if ('focus' in client) {
            client.navigate(path);
            return client.focus();
          }
        }
        return clients.openWindow(path);
      }),
  );
});

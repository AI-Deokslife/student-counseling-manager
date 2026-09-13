self.addEventListener('push', (event) => {
  let payload = { title: '상담 일정 알림', body: '1시간 후 상담 일정이 있습니다.' };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    // Keep the privacy-preserving default when a payload cannot be parsed.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/app-icon-192.png',
      badge: '/app-icon-192.png',
      tag: 'schedule-reminder',
      data: { url: '/calendar' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || '/calendar'));
});

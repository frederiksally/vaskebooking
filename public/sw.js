self.addEventListener('install', (e) => { self.skipWaiting() })
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()) })

self.addEventListener('push', (e) => {
  if (!e.data) return
  const { title, body, url, tag } = e.data.json()
  e.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge.png',
    data: { url },
    tag,
    vibrate: [100, 50, 100],
  }))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/'
  e.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true })
    const same = all.find((c) => c.url.startsWith(self.location.origin))
    if (same) {
      await same.focus()
      try { await same.navigate(url) } catch {}
      return
    }
    await clients.openWindow(url)
  })())
})

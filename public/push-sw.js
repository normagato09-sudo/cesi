// Recordatorios (Web Push). El service worker de la PWA (generado por vite-plugin-pwa) carga este
// archivo con importScripts: muestra la notificación y, al pulsarla, abre la reunión en la app.

self.addEventListener('push', (event) => {
  let data
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const options = {
    body: data.body || '',
    tag: data.tag || undefined,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    lang: 'es',
    data: { url: data.url || '/', meetLink: data.meetLink || '' },
  }
  if (data.meetLink) options.actions = [{ action: 'join', title: 'Unirse a la videollamada' }]
  event.waitUntil(self.registration.showNotification(data.title || 'CESI', options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const { url = '/', meetLink = '' } = event.notification.data || {}
  if (event.action === 'join' && meetLink) {
    event.waitUntil(self.clients.openWindow(meetLink))
    return
  }
  const target = new URL(url, self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const app = windows.find((client) => new URL(client.url).origin === self.location.origin)
      if (app) {
        // La app ya está abierta: abre la reunión y se trae al frente.
        app.postMessage({ type: 'cesi-open-event', url: target })
        await app.focus().catch(() => {})
        return
      }
      await self.clients.openWindow(target)
    })(),
  )
})

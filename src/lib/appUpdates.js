// Versiones nuevas de la app publicadas en Vercel.
//
// El service worker se actualiza solo, pero la página abierta seguía con el código anterior hasta
// cerrarla del todo (en el móvil, con la app instalada, podía durar días): no se veían los
// cambios. Ahora, cuando la versión nueva está lista, la página se recarga una vez: enseguida si
// se acaba de abrir y, si no, la próxima vez que se deja de ver (para no cortar lo que se está
// escribiendo). Se buscan versiones nuevas cada hora por si la app se queda abierta.

const CHECK_EVERY_MS = 60 * 60 * 1000
const JUST_OPENED_MS = 15 * 1000
const RELOAD_KEY = 'cesi_reloaded_at'

// ¿Se ha recargado hace nada? Evita recargar en bucle si algo falla de verdad.
function reloadedRecently(now) {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY))
    return last > 0 && now - last < 10 * 1000
  } catch {
    return false
  }
}

function reload(now = Date.now()) {
  if (reloadedRecently(now)) return false
  try {
    sessionStorage.setItem(RELOAD_KEY, String(now))
  } catch {
    // Sin sessionStorage se recarga igual.
  }
  window.location.reload()
  return true
}

// Recarga ahora si la página se acaba de abrir o no se está viendo; si no, al dejar de verla.
export function reloadWhenSafe({ openedAt, now = Date.now(), doc = document } = {}) {
  if (now - openedAt < JUST_OPENED_MS || doc.visibilityState === 'hidden') {
    reload(now)
    return
  }
  const onHidden = () => {
    if (doc.visibilityState !== 'hidden') return
    doc.removeEventListener('visibilitychange', onHidden)
    reload()
  }
  doc.addEventListener('visibilitychange', onHidden)
}

export async function setupAppUpdates() {
  const openedAt = Date.now()

  // Tras publicar una versión nueva, una página abierta con la anterior puede pedir una sección
  // (Contactos, Equipo…) que ya no existe en el servidor: se recarga una vez para coger la nueva.
  window.addEventListener('vite:preloadError', (event) => {
    if (reload()) event.preventDefault()
  })

  if (!('serviceWorker' in navigator)) return
  const { registerSW } = await import('virtual:pwa-register')
  registerSW({
    immediate: true,
    onNeedReload: () => reloadWhenSafe({ openedAt }),
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => registration.update().catch(() => {}), CHECK_EVERY_MS)
    },
  })
}

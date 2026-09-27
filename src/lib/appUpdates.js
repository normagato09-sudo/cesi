// Versiones nuevas de la app publicadas en Vercel.
//
// El service worker se actualiza solo, pero la página abierta seguía con el código anterior hasta
// cerrarla del todo (en el móvil, con la app instalada, podía durar días): no se veían los
// cambios. Ahora, cuando la versión nueva está lista, la página se recarga una vez: enseguida si
// se acaba de abrir o de volver a ella y, si no, la próxima vez que se deja de ver (para no cortar
// lo que se está escribiendo). Se buscan versiones nuevas al volver a la app y cada hora por si se
// queda abierta. Tras recargar por una versión nueva se avisa unos segundos.

const CHECK_EVERY_MS = 60 * 60 * 1000
const JUST_OPENED_MS = 15 * 1000
const NOTICE_MS = 4000
const RELOAD_KEY = 'cesi_reloaded_at'
const UPDATED_KEY = 'cesi_updated'

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
    sessionStorage.setItem(UPDATED_KEY, '1')
  } catch {
    // Sin sessionStorage se recarga igual (sin aviso).
  }
  window.location.reload()
  return true
}

// ¿Se acaba de recargar por una versión nueva? Solo responde true una vez.
export function takeUpdatedNotice() {
  try {
    if (sessionStorage.getItem(UPDATED_KEY) !== '1') return false
    sessionStorage.removeItem(UPDATED_KEY)
    return true
  } catch {
    return false
  }
}

// Aviso discreto abajo en el centro, que se quita solo.
export function showUpdatedNotice(doc = document, ms = NOTICE_MS) {
  const el = doc.createElement('div')
  el.className = 'app-updated-notice'
  el.setAttribute('role', 'status')
  el.textContent = 'App actualizada a la última versión'
  doc.body.appendChild(el)
  setTimeout(() => el.classList.add('leaving'), ms)
  setTimeout(() => el.remove(), ms + 400)
}

// Recarga ahora si la página se acaba de abrir (o de volver a ella) o no se está viendo; si no, al dejar de verla.
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

// Cada vez que la app vuelve a verse: `onVisible()` (buscar versión nueva y anotar la hora).
export function onReturn(onVisible, doc = document) {
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'visible') onVisible()
  })
}

export async function setupAppUpdates() {
  // Momento en que se empezó a ver la página: al abrirla o al volver a ella.
  let activeSince = Date.now()

  if (takeUpdatedNotice()) showUpdatedNotice()

  // Tras publicar una versión nueva, una página abierta con la anterior puede pedir una sección
  // (Contactos, Equipo…) que ya no existe en el servidor: se recarga una vez para coger la nueva.
  window.addEventListener('vite:preloadError', (event) => {
    if (reload()) event.preventDefault()
  })

  if (!('serviceWorker' in navigator)) return
  const { registerSW } = await import('virtual:pwa-register')
  registerSW({
    immediate: true,
    onNeedReload: () => reloadWhenSafe({ openedAt: activeSince }),
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => registration.update().catch(() => {})
      setInterval(check, CHECK_EVERY_MS)
      onReturn(() => {
        activeSince = Date.now()
        check()
      })
    },
  })
}

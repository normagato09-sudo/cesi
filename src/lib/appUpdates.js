// Versiones nuevas de la app publicadas en Vercel.
//
// El service worker se actualiza solo, pero la página abierta sigue con el código anterior hasta
// recargarla. En el móvil, con la app en la pantalla de inicio, no hay forma de recargar y la
// recarga automática al dejar de ver la app no siempre llega a hacerse (iOS congela la página),
// así que se quedaba la versión antigua. Ahora:
// - Cada build lleva su versión (__APP_VERSION__) y publica /version.json. Al volver a la app y
//   cada hora se compara con la del servidor y se pide al service worker que se actualice.
// - Si hay una versión nueva se muestra el aviso "Hay una versión nueva · Actualizar". Al pulsarlo
//   se guarda lo que esté pendiente (agenda, acta…) y se recarga. Si hay un formulario abierto sin
//   guardar, se pide guardarlo o cerrarlo antes, para no perder nada.
// - Si la versión nueva llega justo al abrir la app y no se está escribiendo, se recarga sin avisar.

/* global __APP_VERSION__ */
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null
export const VERSION_URL = '/version.json'
// Evento que pide guardar ya lo que esté esperando al guardado automático.
export const FLUSH_EVENT = 'cesi:flush-saves'

const CHECK_EVERY_MS = 60 * 60 * 1000
const JUST_OPENED_MS = 15 * 1000
const NOTICE_MS = 4000
const WORKER_WAIT_MS = 5000
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

// Recarga con la versión nueva. `force`: la ha pedido el usuario (no cuenta el freno de bucles).
export function reload({ now = Date.now(), force = false } = {}) {
  if (!force && reloadedRecently(now)) return false
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

// ¿Hay algo escrito sin guardar? Los formularios abiertos (nueva reunión, contacto…) y los campos
// marcados con data-unsaved="true". El de inicio de sesión (data-reload-safe) no cuenta.
export function hasUnsavedWork(doc = document) {
  return !!doc.querySelector('form:not([data-reload-safe]), [data-unsaved="true"]')
}

// ¿Se está escribiendo en algún campo?
function isEditing(doc) {
  const el = doc.activeElement
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

// ¿La versión publicada es distinta de la que está abierta?
export async function newVersionOnServer({ current = APP_VERSION, fetchFn = fetch } = {}) {
  if (!current) return false
  try {
    const res = await fetchFn(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return false
    const { version } = await res.json()
    return typeof version === 'string' && version !== '' && version !== current
  } catch {
    return false
  }
}

// Espera (como mucho unos segundos) a que el service worker nuevo tome el control, para que la
// recarga traiga ya la versión nueva.
async function waitForNewWorker(registration, ms = WORKER_WAIT_MS) {
  if (!registration) return
  try {
    await registration.update()
  } catch {
    // Sin conexión: se recarga con lo que haya.
  }
  const worker = registration.installing || registration.waiting
  if (!worker) return
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated' || worker.state === 'redundant') {
        clearTimeout(timer)
        resolve()
      }
    })
  })
}

/**
 * "Actualizar": guarda lo pendiente y recarga. Devuelve false (sin recargar) si hay algo escrito
 * que no se puede guardar solo (un formulario abierto).
 */
export async function applyUpdate({ registration = null, doc = document, win = window } = {}) {
  win.dispatchEvent(new Event(FLUSH_EVENT))
  if (hasUnsavedWork(doc)) return false
  await waitForNewWorker(registration)
  reload({ force: true })
  return true
}

// Aviso "Hay una versión nueva · Actualizar" (uno solo, se queda hasta que se pulsa).
export function showUpdateBanner({ doc = document, onUpdate }) {
  if (doc.querySelector('.app-update-banner')) return
  const el = doc.createElement('div')
  el.className = 'app-update-banner'
  el.setAttribute('role', 'status')
  const text = doc.createElement('span')
  text.textContent = 'Hay una versión nueva'
  const button = doc.createElement('button')
  button.type = 'button'
  button.textContent = 'Actualizar'
  button.addEventListener('click', async () => {
    button.disabled = true
    const done = await onUpdate()
    if (!done) {
      text.textContent = 'Guarda o cierra lo que tienes abierto y vuelve a pulsar'
      button.disabled = false
    }
  })
  el.append(text, button)
  doc.body.appendChild(el)
}

// Cada vez que la app vuelve a verse: `onVisible()` (buscar versión nueva).
export function onReturn(onVisible, doc = document) {
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'visible') onVisible()
  })
}

/**
 * Qué hacer cuando hay una versión nueva: recargar ya si la app se acaba de abrir y no hay nada
 * a medias; si no, mostrar el aviso.
 */
export function offerUpdate({ loadedAt, now = Date.now(), doc = document, registration = null, allowReload = true }) {
  if (allowReload && now - loadedAt < JUST_OPENED_MS && !hasUnsavedWork(doc) && !isEditing(doc) && reload({ now })) return
  showUpdateBanner({ doc, onUpdate: () => applyUpdate({ registration, doc }) })
}

export async function setupAppUpdates() {
  const loadedAt = Date.now()
  let registration = null

  if (takeUpdatedNotice()) showUpdatedNotice()

  // Tras publicar una versión nueva, una página abierta con la anterior puede pedir una sección
  // (Contactos, Equipo…) que ya no existe en el servidor: se recarga una vez para coger la nueva.
  window.addEventListener('vite:preloadError', (event) => {
    if (reload()) event.preventDefault()
  })

  // Comparar con /version.json no depende del service worker: si hay versión nueva, se avisa.
  const check = async () => {
    registration?.update().catch(() => {})
    if (await newVersionOnServer()) offerUpdate({ loadedAt, registration, allowReload: false })
  }
  setInterval(check, CHECK_EVERY_MS)
  onReturn(check)

  if (!('serviceWorker' in navigator)) {
    check()
    return
  }
  const { registerSW } = await import('virtual:pwa-register')
  registerSW({
    immediate: true,
    // El service worker nuevo ya tiene el control: la página sigue con el código anterior.
    onNeedReload: () => offerUpdate({ loadedAt, registration }),
    onRegisteredSW(_url, reg) {
      registration = reg || null
      check()
    },
  })
}

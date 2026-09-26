import { SYNC_ENABLED, getSupabase } from './sync/client'
import { base64UrlToBytes } from '../../supabase/functions/_shared/webpush.js'

// Recordatorios en este dispositivo (Web Push): permiso, suscripción del navegador y su fila en
// la tabla push_subscriptions de Supabase, que la Edge Function send-reminders usa para avisar
// aunque la app esté cerrada.

export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''
const TABLE = 'push_subscriptions'
// Id del dispositivo con los avisos activados en este navegador (para detectar si otro
// dispositivo lo ha quitado o si el navegador ha renovado la suscripción).
const DEVICE_KEY = 'cesi_push_device_v1'

export const PUSH_MESSAGES = {
  'no-sync':
    'Los recordatorios con la app cerrada necesitan la sincronización con Supabase. Configúrala e inicia sesión para activarlos.',
  'no-key': 'Falta la clave pública de las notificaciones (VITE_VAPID_PUBLIC_KEY) en la configuración de la app.',
  'ios-install':
    'En iPhone y iPad las notificaciones solo funcionan con la app añadida a la pantalla de inicio (iOS 16.4 o posterior): en Safari, pulsa Compartir → «Añadir a pantalla de inicio» y abre CESI desde el icono.',
  unsupported: 'Este navegador no permite notificaciones push. Prueba con Chrome, Edge, Firefox o Safari actualizados.',
  'ios-old': 'Este iPhone o iPad no permite notificaciones de apps web. Hace falta iOS 16.4 o posterior.',
  'no-worker':
    'Las notificaciones necesitan la versión publicada de la app (con service worker). En modo desarrollo no están disponibles.',
  denied:
    'Has bloqueado las notificaciones de CESI en este navegador. Permítelas en los ajustes del sitio (el icono junto a la dirección, o Ajustes → Notificaciones en el móvil) y vuelve a intentarlo.',
}

/**
 * ¿Se pueden activar los avisos en este dispositivo? `env` describe el navegador (ver
 * browserPushEnv). Devuelve { ok: true } o { ok: false, reason, message }.
 */
export function pushAvailability(env) {
  const fail = (reason) => ({ ok: false, reason, message: PUSH_MESSAGES[reason] })
  if (!env.syncEnabled || !env.signedIn) return fail('no-sync')
  if (env.ios && !env.standalone) return fail('ios-install')
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return fail(env.ios ? 'ios-old' : 'unsupported')
  if (!env.vapidKey) return fail('no-key')
  if (env.permission === 'denied') return fail('denied')
  if (!env.hasWorkerScript) return fail('no-worker')
  return { ok: true }
}

function isIOS(nav) {
  const ua = nav.userAgent || ''
  // iPadOS se presenta como Mac, pero con pantalla táctil.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1)
}

export function browserPushEnv({ signedIn }) {
  const nav = typeof navigator !== 'undefined' ? navigator : {}
  const win = typeof window !== 'undefined' ? window : {}
  return {
    syncEnabled: SYNC_ENABLED,
    signedIn,
    vapidKey: VAPID_PUBLIC_KEY,
    ios: isIOS(nav),
    standalone: !!(win.matchMedia?.('(display-mode: standalone)').matches || nav.standalone),
    hasServiceWorker: 'serviceWorker' in nav,
    hasPushManager: 'PushManager' in win,
    hasNotification: 'Notification' in win,
    permission: 'Notification' in win ? win.Notification.permission : 'default',
    hasWorkerScript: !import.meta.env.DEV,
  }
}

// "Chrome en Windows", "Safari en iPhone"…
export function deviceName(userAgent = '') {
  const ua = String(userAgent)
  const system = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'Mac'
            : /CrOS/.test(ua)
              ? 'ChromeOS'
              : /Linux/.test(ua)
                ? 'Linux'
                : ''
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /SamsungBrowser/.test(ua)
        ? 'Samsung Internet'
        : /Firefox|FxiOS/.test(ua)
          ? 'Firefox'
          : /Chrome|CriOS/.test(ua)
            ? 'Chrome'
            : /Safari/.test(ua)
              ? 'Safari'
              : 'Navegador'
  return system ? `${browser} en ${system}` : browser
}

async function endpointId(endpoint) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)))
  return Array.from(hash.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')
}

function readDeviceId() {
  try {
    return localStorage.getItem(DEVICE_KEY)
  } catch {
    return null
  }
}

function writeDeviceId(id) {
  try {
    if (id) localStorage.setItem(DEVICE_KEY, id)
    else localStorage.removeItem(DEVICE_KEY)
  } catch {
    // Sin localStorage no se recuerda; la tabla sigue siendo la referencia.
  }
}

async function client() {
  const supabase = await getSupabase()
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user?.id
  if (!userId) throw new Error('Inicia sesión para usar los recordatorios.')
  return { supabase, userId }
}

async function currentSubscription() {
  if (!('serviceWorker' in navigator)) return null
  const registration = await navigator.serviceWorker.getRegistration()
  return registration ? registration.pushManager.getSubscription() : null
}

// Id de este dispositivo si el navegador tiene una suscripción, o null.
export async function thisDeviceId() {
  const subscription = await currentSubscription()
  return subscription ? endpointId(subscription.endpoint) : null
}

function sameKey(buffer, key) {
  if (!buffer) return false
  const a = new Uint8Array(buffer)
  const b = base64UrlToBytes(key)
  return a.length === b.length && a.every((x, i) => x === b[i])
}

async function saveSubscription(subscription) {
  const { supabase, userId } = await client()
  const json = subscription.toJSON()
  const id = await endpointId(json.endpoint)
  const { error } = await supabase.from(TABLE).upsert(
    {
      user_id: userId,
      id,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      device_name: deviceName(navigator.userAgent),
      time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      user_agent: navigator.userAgent.slice(0, 300),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,id' },
  )
  if (error) throw new Error(`No se pudo guardar el dispositivo en Supabase (${error.message}).`)
  writeDeviceId(id)
  return id
}

/** Activa los avisos en este dispositivo: pide permiso, suscribe el navegador y lo guarda. */
export async function enableThisDevice() {
  const permission = await Notification.requestPermission()
  if (permission === 'denied') throw new Error(PUSH_MESSAGES.denied)
  if (permission !== 'granted') throw new Error('Para activar los avisos, permite las notificaciones cuando el navegador lo pregunte.')
  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  // Si la suscripción es de otras claves VAPID, se renueva.
  if (subscription && !sameKey(subscription.options?.applicationServerKey, VAPID_PUBLIC_KEY)) {
    await subscription.unsubscribe()
    subscription = null
  }
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY),
    })
  }
  return saveSubscription(subscription)
}

/** Quita un dispositivo de la lista. Si es este, también anula la suscripción del navegador. */
export async function removeDevice(id) {
  const { supabase, userId } = await client()
  const { error } = await supabase.from(TABLE).delete().eq('user_id', userId).eq('id', id)
  if (error) throw new Error(`No se pudo quitar el dispositivo (${error.message}).`)
  if (id === (await thisDeviceId()) || id === readDeviceId()) {
    const subscription = await currentSubscription()
    if (subscription) await subscription.unsubscribe()
    writeDeviceId(null)
  }
}

export async function listDevices() {
  const { supabase, userId } = await client()
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, device_name, time_zone, created_at, last_seen_at')
    .eq('user_id', userId)
    .order('created_at')
  if (error) {
    const missing = /push_subscriptions/.test(error.message) && /(does not exist|schema cache|not find)/i.test(error.message)
    throw new Error(
      missing
        ? 'Falta la tabla push_subscriptions en Supabase: ejecuta de nuevo supabase/schema.sql.'
        : `No se pudo cargar la lista de dispositivos (${error.message}).`,
    )
  }
  return data || []
}

/** Envía una notificación de prueba a los dispositivos con los avisos activados. */
export async function sendTestNotification() {
  const { supabase } = await client()
  const { data, error } = await supabase.functions.invoke('send-reminders', { body: { action: 'test' } })
  if (error) {
    // El mensaje de la función (si respondió) o, si no se pudo llamar, el motivo.
    let detail = await error.context
      ?.json?.()
      .then((body) => body?.error || '')
      .catch(() => '')
    if (!detail && /FunctionsFetchError|Failed to send|404/.test(`${error.name} ${error.message}`)) {
      detail = 'no se encuentra la función send-reminders en Supabase (¿está desplegada?)'
    }
    throw new Error(`No se pudo enviar la prueba: ${detail || error.message}.`)
  }
  if (data?.error && !data.sent) throw new Error(data.error)
  return data
}

/**
 * Al abrir la app: si este navegador tenía los avisos activados y ha renovado su suscripción, se
 * guarda la nueva; si otro dispositivo lo quitó de la lista, se desactiva también aquí.
 */
export async function refreshThisDevice() {
  const saved = readDeviceId()
  if (!saved || !SYNC_ENABLED || !VAPID_PUBLIC_KEY || !('serviceWorker' in navigator)) return
  const subscription = await currentSubscription()
  const current = subscription ? await endpointId(subscription.endpoint) : null
  const devices = await listDevices()
  const stillListed = devices.some((d) => d.id === saved)
  if (current === saved) {
    if (!stillListed) {
      await subscription.unsubscribe()
      writeDeviceId(null)
    }
    return
  }
  // La suscripción ha cambiado (o ha desaparecido): se sustituye la antigua.
  if (!stillListed) {
    writeDeviceId(null)
    return
  }
  if (Notification.permission === 'granted') await enableThisDevice()
  const { supabase, userId } = await client()
  await supabase.from(TABLE).delete().eq('user_id', userId).eq('id', saved)
  if (!(await thisDeviceId())) writeDeviceId(null)
}

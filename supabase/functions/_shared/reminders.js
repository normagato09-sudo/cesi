import { expandEvents } from './recurrence.js'

// Recordatorios antes de cada reunión. Se usa en la app (ajustes y formulario) y en la Edge
// Function send-reminders, que cada minuto calcula qué avisos tocan y los envía por Web Push.
//
// Aviso de una reunión (events.data.reminder, también por día en exceptions):
//   sin valor o null  el aviso por defecto (preferencias: reminders.defaultMinutes);
//   5, 10, 15, 30, 60 minutos antes solo para esa reunión;
//   'none'            sin aviso.

export const REMINDER_OPTIONS = [5, 10, 15, 30, 60]
export const DEFAULT_REMINDER_MINUTES = 10
export const NO_REMINDER = 'none'

export function normalizeDefaultMinutes(minutes) {
  return REMINDER_OPTIONS.includes(minutes) ? minutes : DEFAULT_REMINDER_MINUTES
}

// Los bloques "No disponible" y las opciones provisionales de una propuesta no llevan aviso.
function isRealMeeting(ev) {
  return !ev.isUnavailable && !ev.provisional && !ev.allDay
}

// Minutos de antelación del aviso de una reunión (u ocurrencia), o null si no tiene aviso.
export function reminderMinutesOf(ev, defaultMinutes = DEFAULT_REMINDER_MINUTES) {
  if (!isRealMeeting(ev) || ev.reminder === NO_REMINDER) return null
  if (REMINDER_OPTIONS.includes(ev.reminder)) return ev.reminder
  return normalizeDefaultMinutes(defaultMinutes)
}

// Identifica un aviso: la ocurrencia, su hora y la antelación. Si cambia la hora o el aviso,
// es otro aviso (y se vuelve a avisar); si no, nunca se envía dos veces.
export function reminderKey(occurrence, minutes) {
  return `${occurrence.id}|${new Date(occurrence.start).toISOString()}|${minutes}`
}

/**
 * Avisos que tocan en `now`: reuniones que aún no han empezado y cuyo momento de aviso
 * (inicio − minutos) ya ha llegado. En las series cuenta cada día, sin los cancelados y con la
 * hora propia de los cambiados. `toDate` crea las fechas en la zona horaria del usuario (en el
 * servidor). Devuelve [{ key, occurrence, minutes, fireAt }] ordenados por hora de inicio.
 * @param {object[]} events
 * @param {{ now?: Date, defaultMinutes?: number, toDate?: (value: string | number | Date) => Date }} [options]
 */
export function dueReminders(events, { now = new Date(), defaultMinutes = DEFAULT_REMINDER_MINUTES, toDate } = {}) {
  const horizon = new Date(now.getTime() + (Math.max(...REMINDER_OPTIONS) + 1) * 60000)
  const occurrences = expandEvents(events.filter(isRealMeeting), now, horizon, toDate ? { toDate } : undefined)
  const due = []
  for (const occurrence of occurrences) {
    const start = new Date(occurrence.start)
    if (start <= now) continue
    const minutes = reminderMinutesOf(occurrence, defaultMinutes)
    if (minutes === null) continue
    const fireAt = new Date(start.getTime() - minutes * 60000)
    if (fireAt > now) continue
    due.push({ key: reminderKey(occurrence, minutes), occurrence, minutes, fireAt })
  }
  return due.sort((a, b) => new Date(a.occurrence.start) - new Date(b.occurrence.start))
}

// Los avisos que aún no se han enviado (sentKeys: claves ya enviadas).
export function unsentReminders(due, sentKeys) {
  return due.filter((r) => !sentKeys.has(r.key))
}

function timeIn(date, timeZone) {
  return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(new Date(date))
}

function dayIn(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(new Date(date))
}

function countryName(code) {
  try {
    return code ? new Intl.DisplayNames(['es'], { type: 'region' }).of(code) : ''
  } catch {
    return ''
  }
}

// Participantes con otra hora: "Luis (México): 03:00 (día anterior)".
function participantTimes(occurrence, contacts, timeZone) {
  const byId = new Map(contacts.map((c) => [c.id, c]))
  const mine = timeIn(occurrence.start, timeZone)
  const myDay = dayIn(occurrence.start, timeZone)
  const lines = []
  for (const id of occurrence.participantIds || []) {
    const contact = byId.get(id)
    if (!contact?.timeZone) continue
    let theirs
    try {
      theirs = timeIn(occurrence.start, contact.timeZone)
    } catch {
      continue
    }
    if (theirs === mine) continue
    const theirDay = dayIn(occurrence.start, contact.timeZone)
    const shift = theirDay > myDay ? ' (día siguiente)' : theirDay < myDay ? ' (día anterior)' : ''
    const place = countryName(contact.country)
    lines.push(`${contact.name}${place ? ` (${place})` : ''}: ${theirs}${shift}`)
  }
  return lines
}

/**
 * Contenido de la notificación: título, hora (y la hora local de los participantes de otro
 * país), enlace de videollamada y la dirección que abre la reunión en la app.
 * @param {{ key: string, occurrence: any }} reminder
 * @param {{ contacts?: { id: string, name: string, timeZone?: string | null, country?: string | null }[], timeZone?: string, now?: Date }} [options]
 */
export function reminderNotification(reminder, { contacts = [], timeZone, now = new Date() } = {}) {
  const { occurrence } = reminder
  const inMinutes = Math.max(0, Math.round((new Date(occurrence.start) - now) / 60000))
  const when = inMinutes === 0 ? 'empieza ahora' : `empieza en ${inMinutes} min`
  const lines = [`${timeIn(occurrence.start, timeZone)} – ${timeIn(occurrence.end, timeZone)} · ${when}`]
  lines.push(...participantTimes(occurrence, contacts, timeZone))
  if (occurrence.meetLink) lines.push(`Videollamada: ${occurrence.meetLink}`)
  return {
    title: occurrence.title || 'Reunión',
    body: lines.join('\n'),
    tag: reminder.key,
    url: `/?event=${encodeURIComponent(occurrence.id)}`,
    meetLink: occurrence.meetLink || '',
  }
}

export const TEST_NOTIFICATION = {
  title: 'CESI · Notificación de prueba',
  body: 'Los recordatorios funcionan en este dispositivo.',
  tag: 'cesi-test',
  url: '/',
  meetLink: '',
}

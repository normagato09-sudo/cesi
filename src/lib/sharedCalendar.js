import { expandEvents } from './recurrence'
import { mergeIntervals } from './intervals'
import { isNotAttending } from './notAttending'
import { pad2, wallTime, zonedDateTime } from './timezones'

// Calendario compartido (ver «Parte 6» en supabase/schema.sql): reuniones entre personas con
// cuenta (shared_meetings), libre/ocupado y las clases de cada uno. Todo se guarda en UTC y se
// enseña en la zona del perfil de quien lo mira. Va aparte de mis eventos (events) y de la
// sincronización: se lee y se escribe con funciones de Supabase.
//
// Reunión (cesi_my_meetings): { id, title, description, link, starts_at, ends_at, cancelled,
//   organizer_id, organizer_name, my_status: 'pending'|'accepted'|'declined',
//   participants: [{ id, name, status }] }
// Clase (cesi_my_classes): { course_id, course_name, teacher_name, class_key, starts_at, ends_at,
//   is_extra, note, kind: 'alumno'|'profesor', my_status: 'yes'|'no'|null, confirmed }

export const DURATIONS = [15, 30, 45, 60, 90, 120]
export const DEFAULT_DURATION = 60
export const MAX_TITLE = 200

const DAY_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
const DAY_MS = 24 * 60 * 60 * 1000

export const STATUS_LABELS = { pending: 'Pendiente', accepted: 'Aceptada', declined: 'Rechazada' }

// ---------------------------------------------------------------------------
// Días en una zona ('AAAA-MM-DD')
// ---------------------------------------------------------------------------

function parseKey(key) {
  const [year, month, day] = key.split('-').map(Number)
  return { year, month, day }
}

function keyFromUtc(t) {
  const d = new Date(t)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

export function keyOf(date, zone) {
  const w = wallTime(date, zone)
  return `${w.year}-${pad2(w.month)}-${pad2(w.day)}`
}

export function hhmmOf(date, zone) {
  const w = wallTime(date, zone)
  return `${pad2(w.hour)}:${pad2(w.minute)}`
}

export function addDaysKey(key, days) {
  const { year, month, day } = parseKey(key)
  return keyFromUtc(Date.UTC(year, month - 1, day) + days * DAY_MS)
}

export function weekdayOf(key) {
  const { year, month, day } = parseKey(key)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

// Lunes de la semana de ese día.
export function mondayOf(key) {
  return addDaysKey(key, -((weekdayOf(key) + 6) % 7))
}

export function weekKeys(monday) {
  return Array.from({ length: 7 }, (_, i) => addDaysKey(monday, i))
}

// Instante de un día y una hora 'HH:mm' en una zona (exists: false si esa hora no existe por el
// cambio de hora).
export function instantOf(key, hhmm, zone) {
  const [hour, minute] = hhmm.split(':').map(Number)
  return zonedDateTime({ ...parseKey(key), hour, minute }, zone)
}

// [inicio, fin) de unos días seguidos en una zona.
export function daysRange(firstKey, days, zone) {
  return { start: instantOf(firstKey, '00:00', zone).date, end: instantOf(addDaysKey(firstKey, days), '00:00', zone).date }
}

export function dayLabel(key) {
  const { month, day } = parseKey(key)
  return `${DAY_SHORT[weekdayOf(key)]} ${day} ${MONTH_SHORT[month - 1]}`
}

export function weekLabel(monday) {
  const last = addDaysKey(monday, 6)
  const a = parseKey(monday)
  const b = parseKey(last)
  return a.month === b.month
    ? `${a.day}–${b.day} ${MONTH_SHORT[a.month - 1]} ${a.year}`
    : `${a.day} ${MONTH_SHORT[a.month - 1]} – ${b.day} ${MONTH_SHORT[b.month - 1]} ${b.year}`
}

// «lun 4 nov · 18:00–19:00» en esa zona.
export function whenLabel(start, end, zone) {
  return `${dayLabel(keyOf(start, zone))} · ${hhmmOf(start, zone)}–${hhmmOf(end, zone)}`
}

// ---------------------------------------------------------------------------
// Lo que sale en el calendario
// ---------------------------------------------------------------------------

export function meetingItem(row) {
  return { kind: 'meeting', id: `meeting:${row.id}`, title: row.title, start: new Date(row.starts_at), end: new Date(row.ends_at), meeting: row }
}

// Una reunión compartida como evento de mi calendario (solo para verla; no se guarda en events
// ni se puede arrastrar). Al pulsarla se abre su ficha del calendario compartido.
export function sharedMeetingEvent(row) {
  return {
    id: `shared:${row.id}`,
    shared: true,
    sharedPending: row.my_status === 'pending',
    sharedMeeting: row,
    title: row.title,
    start: new Date(row.starts_at),
    end: new Date(row.ends_at),
    participantIds: [],
    guests: [],
  }
}

// Las que salen en mi calendario: ni canceladas ni rechazadas.
export function sharedEventsForCalendar(rows) {
  return rows.filter((m) => !m.cancelled && m.my_status !== 'declined').map(sharedMeetingEvent)
}

export function classItem(row) {
  return {
    kind: 'class',
    id: `class:${row.course_id}:${row.class_key}`,
    title: row.course_name || 'Clase',
    start: new Date(row.starts_at),
    end: new Date(row.ends_at),
    cls: row,
  }
}

// Lo de cada día (por la hora de inicio en la zona), ordenado por hora.
export function itemsByDay(items, keys, zone) {
  const out = new Map(keys.map((k) => [k, []]))
  for (const item of items) out.get(keyOf(item.start, zone))?.push(item)
  for (const list of out.values()) list.sort((a, b) => a.start - b.start)
  return out
}

// ---------------------------------------------------------------------------
// Libre/ocupado
// ---------------------------------------------------------------------------

/**
 * Horas en las que TODOS están libres: Map(día → [24 × 'free' | 'busy' | 'past' | 'none']).
 * busyRows: [{ profile_id, starts_at, ends_at }] (cesi_free_busy); una hora es libre si nadie
 * tiene nada ocupado en ella entera. 'none': hora que no existe ese día (cambio de hora).
 */
export function freeHours(busyRows, keys, zone, now = new Date()) {
  const busy = mergeIntervals(busyRows.map((r) => ({ start: new Date(r.starts_at), end: new Date(r.ends_at) })))
  const out = new Map()
  for (const key of keys) {
    const hours = []
    for (let h = 0; h < 24; h++) {
      const { date: start, exists } = instantOf(key, `${pad2(h)}:00`, zone)
      if (!exists) {
        hours.push('none')
        continue
      }
      const end = h === 23 ? instantOf(addDaysKey(key, 1), '00:00', zone).date : instantOf(key, `${pad2(h + 1)}:00`, zone).date
      if (end <= now) hours.push('past')
      else hours.push(busy.some((b) => b.start < end && b.end > start) ? 'busy' : 'free')
    }
    out.set(key, hours)
  }
  return out
}

// ---------------------------------------------------------------------------
// Formulario de reunión
// ---------------------------------------------------------------------------

export function emptyMeetingForm(zone, now = new Date()) {
  // La próxima hora en punto.
  const next = new Date(Math.ceil((now.getTime() + 1) / 3600000) * 3600000)
  return { title: '', date: keyOf(next, zone), time: hhmmOf(next, zone), minutes: DEFAULT_DURATION, description: '', link: '', participants: [] }
}

export function formFromMeeting(m, zone) {
  const start = new Date(m.starts_at)
  const minutes = Math.round((new Date(m.ends_at) - start) / 60000)
  return {
    title: m.title,
    date: keyOf(start, zone),
    time: hhmmOf(start, zone),
    minutes,
    description: m.description || '',
    link: m.link || '',
    participants: m.participants.map((p) => p.id).filter((id) => id !== m.organizer_id),
  }
}

export function meetingTimes(form, zone) {
  const { date: start, exists } = instantOf(form.date, form.time, zone)
  return { start, end: new Date(start.getTime() + Number(form.minutes) * 60000), exists }
}

// { campo: mensaje } ({} si está bien).
export function validateMeetingForm(form, zone) {
  const errors = {}
  const title = form.title.trim()
  if (!title) errors.title = 'Escribe un título.'
  else if (title.length > MAX_TITLE) errors.title = 'El título es demasiado largo.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date || '')) errors.date = 'Elige el día.'
  else if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.time || '')) errors.time = 'Elige la hora.'
  else if (!meetingTimes(form, zone).exists) errors.time = 'Esa hora no existe ese día (cambio de hora).'
  if (!(Number(form.minutes) > 0 && Number(form.minutes) <= 12 * 60)) errors.minutes = 'Elige la duración.'
  if (form.participants.length === 0) errors.participants = 'Añade al menos un participante.'
  return errors
}

// ---------------------------------------------------------------------------
// Mis bloques ocupados (la ceo): lo que se publica en ceo_busy
// ---------------------------------------------------------------------------

export const CEO_BUSY_WEEKS = 8

// [[inicio, fin]] (ISO) de mis reuniones y franjas de las próximas semanas, desde el principio de
// hoy: también las de todo el día y las provisionales, salvo las que organizo sin asistir. Solo
// las horas, sin títulos ni nada más.
export function ceoBusyBlocks(rawEvents, now = new Date(), weeks = CEO_BUSY_WEEKS) {
  const from = new Date(now)
  from.setHours(0, 0, 0, 0)
  const to = new Date(from.getTime() + weeks * 7 * DAY_MS)
  const occurrences = expandEvents(rawEvents, from, to).filter((ev) => !isNotAttending(ev))
  return mergeIntervals(occurrences.map((ev) => ({ start: ev.start, end: ev.end })))
    .filter((r) => r.end > r.start)
    .map((r) => [r.start.toISOString(), r.end.toISOString()])
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

async function rpc(client, fn, args) {
  const { data, error } = await client.rpc(fn, args)
  if (error) throw error
  return data
}

// p_as: solo la ceo, para «Ver como» (las de otra persona).
export function listMyMeetings(client, from, to, asId = null) {
  return rpc(client, 'cesi_my_meetings', { p_from: from.toISOString(), p_to: to.toISOString(), p_as: asId })
}

export function listMyClasses(client, from, to, asId = null) {
  return rpc(client, 'cesi_my_classes', { p_from: from.toISOString(), p_to: to.toISOString(), p_as: asId })
}

export function listInvitablePeople(client) {
  return rpc(client, 'cesi_invitable_people', {})
}

export function fetchFreeBusy(client, people, from, to, excludeId = null) {
  return rpc(client, 'cesi_free_busy', { p_people: people, p_from: from.toISOString(), p_to: to.toISOString(), p_exclude: excludeId })
}

export function saveMeeting(client, id, form, zone) {
  const { start, end } = meetingTimes(form, zone)
  return rpc(client, 'cesi_meeting_save', {
    p_id: id,
    p_title: form.title.trim(),
    p_description: form.description.trim(),
    p_link: form.link.trim(),
    p_starts_at: start.toISOString(),
    p_ends_at: end.toISOString(),
    p_participants: form.participants,
  })
}

export function cancelMeeting(client, id) {
  return rpc(client, 'cesi_meeting_cancel', { p_id: id })
}

export function respondMeeting(client, id, status) {
  return rpc(client, 'cesi_meeting_respond', { p_id: id, p_status: status })
}

export function listClassAttendees(client, courseId, classKey) {
  return rpc(client, 'cesi_class_attendees', { p_course_id: courseId, p_class_key: classKey })
}

export function confirmClass(client, courseId, classKey, status) {
  return rpc(client, 'cesi_class_confirm', { p_course_id: courseId, p_class_key: classKey, p_status: status })
}

export function publishCeoBusy(client, blocks) {
  return rpc(client, 'cesi_publish_my_busy', { p_blocks: blocks })
}

// Mensaje para enseñar de un error de Supabase (las funciones lanzan mensajes en español).
export function errorText(err) {
  if (err?.code === 'PGRST202' || err?.code === '42883') return 'Falta ejecutar en Supabase el SQL de la parte 6 (calendario compartido).'
  return err?.message || 'No se pudo completar. Inténtalo de nuevo.'
}

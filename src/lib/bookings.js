import { addDays, format, parseISO, startOfWeek } from 'date-fns'
import { expandEvents } from './recurrence'
import { mergeIntervals, subtractIntervals } from './intervals'
import { scheduleIntervalsOn, weekKeyOf } from './weeklyAvailability'
import { isNotAttending } from './notAttending'
import { daysOff } from './unavailableKinds'
import { meetingWhen } from './meetingWhen'
import { formatDurationLong } from './proposals'
import { defaultContactZone, findZone, localTimeZone, zonePlace } from './timezones'
import { newLinkToken, PUBLIC_URL } from './contactLinks'
import { getSupabase } from './sync/client'

// Enlace de reservas (página pública /reservar/<token>, tipo Calendly). Ver la sección del mismo
// nombre en supabase/schema.sql.
// - La app calcula los huecos libres de las semanas declaradas (sin mis reuniones, franjas "No
//   disponible" ni opciones provisionales) y los publica en booking_links.published, solo como
//   intervalos de tiempo: nada de títulos, participantes ni notas.
// - Quien abre el enlace pide una reunión; la solicitud (booking_requests) me llega pendiente y la
//   acepto (se crea la reunión) o la rechazo, con un mensaje de plantilla para avisarle.
// Necesita la sincronización con Supabase.

export const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120]
export const DEFAULT_DURATIONS = [30, 60]
export const NOTICE_OPTIONS = [0, 2, 12, 24, 48, 72]
export const DEFAULT_NOTICE_HOURS = 24
export const MIN_FREE_MINUTES = 15

const WEEK_OPTS = { weekStartsOn: 1 }

/**
 * Lo que se publica para el enlace: { free: [[inicio, fin]] (ISO), weeks: ['AAAA-MM-DD'] (lunes de
 * las semanas declaradas, desde la actual), daysOff: [{ date, kind }] (vacaciones y festivos de
 * esas semanas), horizonEnd (ISO, fin de la última semana declarada) o null, timeZone }.
 * Solo cuentan las semanas declaradas expresamente (no el horario habitual). Ocupan el tiempo
 * todas mis reuniones y franjas, salvo las que organizo sin asistir.
 */
export function bookingAvailability({ rawEvents, weeklyAvailability = [], now = new Date(), timeZone = localTimeZone() }) {
  const firstWeek = startOfWeek(now, WEEK_OPTS)
  const firstKey = format(firstWeek, 'yyyy-MM-dd')
  const weeks = [
    ...new Set(weeklyAvailability.filter((d) => Array.isArray(d.week) && d.weekStart >= firstKey).map((d) => d.weekStart)),
  ].sort()
  if (weeks.length === 0) return { free: [], weeks: [], daysOff: [], horizonEnd: null, timeZone }

  const horizonEnd = addDays(parseISO(weeks[weeks.length - 1]), 7)
  const occurrences = expandEvents(rawEvents, firstWeek, horizonEnd)
  const busy = mergeIntervals(occurrences.filter((ev) => !isNotAttending(ev)).map((ev) => ({ start: ev.start, end: ev.end })))

  const windows = []
  for (const key of weeks) {
    const monday = parseISO(key)
    for (let i = 0; i < 7; i++) windows.push(...scheduleIntervalsOn(addDays(monday, i), null, weeklyAvailability))
  }
  const free = subtractIntervals(mergeIntervals(windows), busy)
    .filter((r) => r.end - r.start >= MIN_FREE_MINUTES * 60000)
    .map((r) => [r.start.toISOString(), r.end.toISOString()])

  const declared = new Set(weeks)
  const off = daysOff(occurrences, firstWeek, addDays(horizonEnd, -1)).filter((d) => declared.has(weekKeyOf(parseISO(d.date))))
  return { free, weeks, daysOff: off, horizonEnd: horizonEnd.toISOString(), timeZone }
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

export function bookingLinkUrl(token, base = PUBLIC_URL || globalThis.location?.origin || '') {
  return `${base.trim().replace(/\/+$/, '')}/reservar/${token}`
}

async function client() {
  const supabase = await getSupabase()
  if (!supabase) throw new Error('El enlace de reservas necesita la sincronización con Supabase.')
  return supabase
}

function check({ data, error }) {
  if (!error) return data
  if (error.code === '42P01' || error.code === 'PGRST205') {
    throw new Error('Falta preparar Supabase: ejecuta otra vez supabase/schema.sql en el SQL Editor.')
  }
  throw new Error(error.message || 'No se pudo conectar con Supabase.')
}

const LINK_FIELDS = 'token, display_name, durations, min_notice_hours, step_minutes, published_at, created_at'

// Ajustes del enlace tal como los usa la app.
export function linkSettings(row) {
  return {
    displayName: row?.display_name || '',
    durations: Array.isArray(row?.durations) && row.durations.length ? [...row.durations].sort((a, b) => a - b) : DEFAULT_DURATIONS,
    minNoticeHours: row?.min_notice_hours ?? DEFAULT_NOTICE_HOURS,
  }
}

function settingsRow({ displayName = '', durations = DEFAULT_DURATIONS, minNoticeHours = DEFAULT_NOTICE_HOURS }) {
  return {
    display_name: displayName.replace(/\s+/g, ' ').trim().slice(0, 80),
    durations: [...new Set(durations)].filter((d) => DURATION_OPTIONS.includes(d)).sort((a, b) => a - b),
    min_notice_hours: minNoticeHours,
  }
}

// Mensaje de error de los ajustes o null.
export function validateSettings({ durations }) {
  if (!durations || durations.length === 0) return 'Elige al menos una duración.'
  return null
}

// Enlace activo o null.
export async function getBookingLink() {
  const supabase = await client()
  const rows = check(
    await supabase.from('booking_links').select(LINK_FIELDS).eq('revoked', false).order('created_at', { ascending: false }).limit(1),
  )
  return rows?.[0] || null
}

export async function revokeBookingLink() {
  const supabase = await client()
  check(await supabase.from('booking_links').update({ revoked: true }).eq('revoked', false))
}

// Crea un enlace nuevo (el anterior deja de valer) con esos ajustes y lo que hay que publicar.
export async function createBookingLink(settings, published) {
  await revokeBookingLink()
  const supabase = await client()
  const row = { token: newLinkToken(), ...settingsRow(settings), published, published_at: new Date().toISOString() }
  return check(await supabase.from('booking_links').insert(row).select(LINK_FIELDS).single())
}

export async function updateBookingSettings(token, settings) {
  const supabase = await client()
  return check(await supabase.from('booking_links').update(settingsRow(settings)).eq('token', token).select(LINK_FIELDS).single())
}

export async function publishAvailability(token, published) {
  const supabase = await client()
  check(await supabase.from('booking_links').update({ published, published_at: new Date().toISOString() }).eq('token', token))
}

const REQUEST_FIELDS = 'id, starts_at, ends_at, name, email, phone, reason, time_zone, status, created_at'

// Solicitudes pendientes que aún no han empezado (las demás han caducado: su hueco ya se liberó).
export async function getPendingRequests(now = new Date()) {
  const supabase = await client()
  return check(
    await supabase
      .from('booking_requests')
      .select(REQUEST_FIELDS)
      .eq('status', 'pending')
      .gt('starts_at', now.toISOString())
      .order('starts_at', { ascending: true }),
  )
}

export async function decideRequest(id, status) {
  const supabase = await client()
  check(await supabase.from('booking_requests').update({ status, decided_at: new Date().toISOString() }).eq('id', id).eq('status', 'pending'))
}

// Avisa de cada solicitud nueva (Realtime); devuelve la función para dejar de escuchar.
export async function watchRequests(onChange) {
  const supabase = await client()
  const channel = supabase
    .channel('cesi-booking-requests')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_requests' }, () => onChange())
    .subscribe()
  return () => supabase.removeChannel(channel)
}

// ---------------------------------------------------------------------------
// Aceptar o rechazar
// ---------------------------------------------------------------------------

const digits = (text) => String(text || '').replace(/\D/g, '')

// Contacto que coincide con quien reserva (mismo email o mismo teléfono, últimas 9 cifras), o null.
export function matchContact(request, contacts) {
  const email = (request.email || '').trim().toLowerCase()
  const phone = digits(request.phone).slice(-9)
  return (
    contacts.find(
      (c) =>
        !c.candidateOnly &&
        ((email && (c.email || '').trim().toLowerCase() === email) || (phone.length >= 6 && digits(c.phone).slice(-9) === phone)),
    ) || null
  )
}

// Datos del contacto nuevo al aceptar: país y zona según la zona horaria de quien reservó (si no
// se reconoce, España, marcado como "país sin revisar").
export function bookingContactData(request) {
  const found = findZone(request.time_zone)
  const zone = found ? { country: found.country.code, timeZone: request.time_zone } : { ...defaultContactZone(), countryUnreviewed: true }
  return { name: (request.name || '').trim(), email: (request.email || '').trim(), phone: (request.phone || '').trim(), ...zone }
}

export function requestTitle(request) {
  return `Reunión con ${(request.name || '').trim() || 'invitado'}`
}

// Descripción de la reunión creada al aceptar: el motivo y los datos de contacto.
export function requestDescription(request) {
  const lines = [`Motivo: ${(request.reason || '').trim()}`]
  if (request.email) lines.push(`Email: ${request.email}`)
  if (request.phone) lines.push(`Teléfono: ${request.phone}`)
  lines.push('Reservada desde el enlace de reservas.')
  return lines.join('\n')
}

// Duración en minutos.
export function requestMinutes(request) {
  return Math.round((new Date(request.ends_at) - new Date(request.starts_at)) / 60000)
}

// "martes 14 de octubre a las 10:00 (hora de España)" en la zona de quien reservó.
export function requestWhenText(request, fallbackZone = localTimeZone()) {
  const zone = request.time_zone || fallbackZone
  const { day, time } = meetingWhen(new Date(request.starts_at), zone)
  return `${day} a las ${time} (hora de ${zonePlace(zone)})`
}

const firstName = (name) => (name || '').trim().split(/\s+/)[0] || ''

/**
 * Mensaje (plantilla, sin IA) para avisar a quien reservó. `status`: 'accepted' o 'rejected'.
 * Al rechazar se le invita a elegir otro hueco en el mismo enlace (`url`), si lo hay.
 * Devuelve { text, subject, phone, email }.
 */
export function decisionMessage(request, status, { url = '', fallbackZone } = {}) {
  const hello = `Hola${firstName(request.name) ? `, ${firstName(request.name)}` : ''}.`
  const when = requestWhenText(request, fallbackZone)
  const lines = [hello, '']
  if (status === 'accepted') {
    lines.push(`Te confirmo la reunión del ${when}, de ${formatDurationLong(requestMinutes(request))}.`)
    lines.push('Si al final no puedes, avísame.')
  } else {
    lines.push(`Lo siento, no puedo reunirme el ${when}.`)
    if (url) lines.push(`Si quieres, puedes elegir otro hueco en el mismo enlace: ${url}`)
  }
  lines.push('', 'Un saludo.')
  return {
    text: lines.join('\n'),
    subject: status === 'accepted' ? 'Reunión confirmada' : 'Sobre tu solicitud de reunión',
    phone: request.phone || '',
    email: request.email || '',
  }
}

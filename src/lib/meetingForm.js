import { addDaysKey, formFromMeeting, hhmmOf, instantOf, keyOf } from './sharedCalendar'
import { participantFields, participantsOf } from './contacts'
import { allDaySpanDays, cleanNote, unavailableKindOf, unavailableNoteOf, unavailableTitle } from './unavailableKinds'
import { isInterview } from './vacancies'
import { DAY_END_MINUTES } from './weeklySchedule'
import { pad2 } from './timezones'
import { availabilityIntervals } from './contactAvailability'

// «Nueva reunión»: el único formulario de reuniones (para la ceo, el equipo y los alumnos). Aquí
// va lo que no es pantalla: de qué se parte, qué color tiene cada hora de la tabla, el resumen de
// la hora elegida y lo que se guarda.
//
// Formulario: { mode: 'meeting' | 'unavailable', title, link, place, description, date, time,
//   minutes, allDay, endDate, kind, accounts: [ids de cuentas], contactIds: [contactos sin cuenta
//   o externos], guests: [nombres sueltos], repeatFreq, repeatInterval, monthlyBy, repeatUntil,
//   notAttending, interview }. Fechas 'AAAA-MM-DD' y horas 'HH:MM' en la zona del perfil.

export const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180]
export const DEFAULT_MINUTES = 60
export const MAX_MINUTES = 12 * 60

function nextHour(now, zone) {
  const next = new Date(Math.ceil((now.getTime() + 1) / 3600000) * 3600000)
  return { date: keyOf(next, zone), time: hhmmOf(next, zone) }
}

function threeMonthsLater(key) {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1 + 3, d))
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
}

function emptyForm(zone, now) {
  const { date, time } = nextHour(now, zone)
  return {
    mode: 'meeting',
    title: '',
    link: '',
    place: '',
    description: '',
    date,
    time,
    minutes: DEFAULT_MINUTES,
    allDay: false,
    endDate: date,
    kind: 'other',
    accounts: [],
    contactIds: [],
    guests: [],
    repeatFreq: '',
    repeatInterval: '1',
    monthlyBy: 'date',
    repeatUntil: threeMonthsLater(date),
    notAttending: false,
    interview: false,
  }
}

// Un evento mío (para editarlo o duplicarlo) como formulario.
function formFromEvent(event, contacts, zone) {
  const start = new Date(event.start)
  const end = new Date(event.end)
  const resolved = participantsOf(event, contacts)
  const date = keyOf(start, zone)
  const allDay = !!event.allDay
  const r = event.recurrence
  return {
    mode: event.isUnavailable ? 'unavailable' : 'meeting',
    title: event.isUnavailable ? '' : event.title || '',
    link: event.meetLink || '',
    place: event.location || '',
    description: event.description || '',
    date,
    time: allDay ? '09:00' : hhmmOf(start, zone),
    minutes: allDay ? DEFAULT_MINUTES : Math.max(5, Math.round((end - start) / 60000)),
    allDay,
    endDate: allDay ? addDaysKey(date, allDaySpanDays(event) - 1) : date,
    kind: event.isUnavailable ? unavailableKindOf(event) : 'other',
    accounts: [],
    contactIds: resolved.contacts.map((c) => c.id),
    guests: resolved.guests,
    repeatFreq: r?.freq || '',
    repeatInterval: String(r?.interval || 1),
    monthlyBy: r?.monthlyBy || 'date',
    repeatUntil: r?.until ? keyOf(new Date(r.until), zone) : threeMonthsLater(date),
    notAttending: !!event.notAttending,
    interview: !event.isUnavailable && isInterview(event),
  }
}

/**
 * De qué parte el formulario: una reunión compartida mía (`meeting`), un evento mío que se edita
 * (`event`) o se duplica (`prefill.source`), o una nueva con lo que llegue en `prefill`
 * ({ date, time } o { start, end }, externalIds, guests, interview, notAttending, mode }).
 */
export function initialForm({ meeting = null, event = null, prefill = null, contacts = [], zone, now = new Date() }) {
  if (meeting) {
    const m = formFromMeeting(meeting, zone)
    return { ...emptyForm(zone, now), ...m, accounts: m.participants, participants: undefined }
  }
  if (event) return formFromEvent(event, contacts, zone)
  if (prefill?.source) return { ...formFromEvent(prefill.source, contacts, zone), repeatFreq: '' }
  const form = emptyForm(zone, now)
  if (!prefill) return form
  if (prefill.start) {
    const start = new Date(prefill.start)
    Object.assign(form, { date: keyOf(start, zone), time: hhmmOf(start, zone), endDate: keyOf(start, zone) })
    if (prefill.end) form.minutes = Math.max(5, Math.round((new Date(prefill.end) - start) / 60000))
  }
  if (prefill.date) Object.assign(form, { date: prefill.date, endDate: prefill.date })
  if (prefill.time) form.time = prefill.time
  if (prefill.externalIds) form.contactIds = [...prefill.externalIds]
  if (prefill.guests) form.guests = [...prefill.guests]
  if (prefill.interview) form.interview = true
  if (prefill.notAttending) form.notAttending = true
  if (prefill.mode === 'unavailable') form.mode = 'unavailable'
  form.repeatUntil = threeMonthsLater(form.date)
  return form
}

// Inicio y fin de lo elegido (instantes reales). En «No disponible» de todo el día: desde las 00:00
// del primer día hasta las 00:00 del día siguiente al último (en la zona).
export function chosenTimes(form, zone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date || '')) return null
  if (form.mode === 'unavailable' && form.allDay) {
    const last = /^\d{4}-\d{2}-\d{2}$/.test(form.endDate || '') && form.endDate >= form.date ? form.endDate : form.date
    return { start: instantOf(form.date, '00:00', zone).date, end: instantOf(addDaysKey(last, 1), '00:00', zone).date, exists: true }
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.time || '')) return null
  const { date: start, exists } = instantOf(form.date, form.time, zone)
  return { start, end: new Date(start.getTime() + Number(form.minutes) * 60000), exists }
}

/**
 * Cada hora de la tabla, para las personas que cuentan (`people`: ids de cuenta, el organizador
 * incluido): Map(día → [24 × { state, free, total, busy }]). state: 'all' (les va bien a todos),
 * 'some' (solo a algunos), 'nobody', 'past' o 'none' (hora que no existe ese día).
 * busyRows: [{ profile_id, starts_at, ends_at }] de cesi_free_busy.
 */
export function hourCells(busyRows, people, keys, zone, now = new Date()) {
  const rows = busyRows.map((r) => ({ id: r.profile_id, start: new Date(r.starts_at), end: new Date(r.ends_at) }))
  const out = new Map()
  for (const key of keys) {
    const hours = []
    for (let h = 0; h < 24; h++) {
      const { date: start, exists } = instantOf(key, `${pad2(h)}:00`, zone)
      if (!exists) {
        hours.push({ state: 'none', free: 0, total: people.length, busy: [] })
        continue
      }
      const end = h === 23 ? instantOf(addDaysKey(key, 1), '00:00', zone).date : instantOf(key, `${pad2(h + 1)}:00`, zone).date
      const busy = people.filter((id) => rows.some((r) => r.id === id && r.start < end && r.end > start))
      const free = people.length - busy.length
      const state = end <= now ? 'past' : free === people.length ? 'all' : free === 0 ? 'nobody' : 'some'
      hours.push({ state, free, total: people.length, busy })
    }
    out.set(key, hours)
  }
  return out
}

// Primera hora (0-23) en que a alguien le va bien esa semana, para empezar la tabla ahí.
export function firstUsefulHour(cells) {
  let first = 24
  for (const hours of cells.values()) {
    const h = hours.findIndex((c) => c.state === 'all' || c.state === 'some')
    if (h >= 0 && h < first) first = h
  }
  return first === 24 ? 8 : first
}

// Quién está ocupado en [start, end): ids.
export function busyDuring(busyRows, people, start, end) {
  return people.filter((id) => busyRows.some((r) => r.profile_id === id && new Date(r.starts_at) < end && new Date(r.ends_at) > start))
}

// Quita de mis ocupados un rato (el de mi propio evento, al editarlo).
export function withoutInterval(busyRows, profileId, start, end) {
  const out = []
  for (const r of busyRows) {
    const s = new Date(r.starts_at)
    const e = new Date(r.ends_at)
    if (r.profile_id !== profileId || e <= start || s >= end) {
      out.push(r)
      continue
    }
    if (s < start) out.push({ ...r, ends_at: start.toISOString() })
    if (e > end) out.push({ ...r, starts_at: end.toISOString() })
  }
  return out
}

// Descripción de una reunión compartida: la escrita, el lugar y los externos (que no tienen cuenta).
export function sharedDescription(form, externals) {
  const parts = [form.description.trim()]
  if (form.place.trim()) parts.push(`Lugar: ${form.place.trim()}`)
  const names = externals.map((x) => (x.email ? `${x.name || x.email} (${x.email})` : x.name || 'Sin nombre'))
  if (names.length > 0) parts.push(`Externos: ${names.join(', ')}`)
  return parts.filter(Boolean).join('\n\n')
}

const INTERVAL_RE = /^\d{1,2}$/

/**
 * Lo que se guarda como evento mío (reunión sin nadie con cuenta, o «No disponible»), con el
 * formato de siempre: { payload } o { error }. `original`: el evento que se edita (para conservar
 * la nota de una franja antigua y no marcar «entrevista» sin motivo).
 */
export function localPayload(form, zone, { contacts = [], original = null, showInterview = false } = {}) {
  const isUnavailable = form.mode === 'unavailable'
  if (!isUnavailable && !form.title.trim()) return { error: 'Escribe un título.' }
  const times = chosenTimes(form, zone)
  if (!times) return { error: 'Elige el día y la hora.' }
  if (!times.exists) return { error: 'Esa hora no existe ese día (cambio de hora).' }
  if (isUnavailable && form.allDay && form.endDate < form.date) return { error: 'El último día es anterior al primero.' }
  let { start, end } = times
  if (!(isUnavailable && form.allDay)) {
    // Mis eventos acaban como muy tarde a las 23:59 del día en que empiezan.
    const dayEnd = instantOf(form.date, `${pad2(Math.floor(DAY_END_MINUTES / 60))}:${pad2(DAY_END_MINUTES % 60)}`, zone).date
    if (end > dayEnd) end = dayEnd
    if (end <= start) return { error: 'Tiene que acabar como muy tarde a las 23:59 del mismo día.' }
  }
  let recurrence = null
  if (form.repeatFreq) {
    if (!INTERVAL_RE.test(String(form.repeatInterval).trim()) || Number(form.repeatInterval) < 1) {
      return { error: 'Indica cada cuántas veces se repite: un número del 1 al 99.' }
    }
    if (!form.repeatUntil) return { error: 'Indica hasta cuándo se repite.' }
    recurrence = {
      freq: form.repeatFreq,
      interval: Number(form.repeatInterval),
      ...(form.repeatFreq === 'monthly' ? { monthlyBy: form.monthlyBy || 'date' } : {}),
      until: new Date(`${form.repeatUntil}T23:59:59`).toISOString(),
    }
  }
  const isDayOff = isUnavailable && form.allDay && form.kind !== 'other'
  const initialInterview = !!original && !original.isUnavailable && isInterview(original)
  const interviewField = !isUnavailable && showInterview && (!original || form.interview !== initialInterview) ? { interview: form.interview } : {}
  const savedNote = original?.isUnavailable ? unavailableNoteOf(original) : ''
  const chosen = form.contactIds.map((id) => contacts.find((c) => c.id === id)).filter(Boolean)
  return {
    payload: {
      title: isUnavailable ? unavailableTitle(isDayOff ? form.kind : 'other') : form.title.trim(),
      description: isUnavailable ? '' : form.description.trim(),
      ...(isUnavailable ? participantFields([], []) : participantFields(chosen, form.guests)),
      meetLink: isUnavailable ? '' : form.link.trim(),
      location: isUnavailable ? '' : form.place.trim(),
      notAttending: !isUnavailable && form.notAttending,
      ...interviewField,
      isUnavailable,
      allDay: isUnavailable ? form.allDay : false,
      ...(isUnavailable
        ? {
            unavailableNote: cleanNote(savedNote),
            ...(form.allDay ? { unavailableKind: form.kind === 'vacation' && original?.unavailableKind === 'holiday' ? 'holiday' : form.kind } : {}),
          }
        : {}),
      start,
      end,
      recurrence,
    },
  }
}

/**
 * Hora de la reunión para un contacto externo, en su zona: { time: '13:00', outside } (outside:
 * le cae fuera de su horario apuntado, entera o en parte). null si el contacto no tiene zona.
 */
export function externalLocalTime(contact, start, end) {
  if (!contact?.timeZone || !start || !end) return null
  const intervals = availabilityIntervals(contact, start, end)
  const covered = intervals === null || intervals.some((i) => i.start <= start && i.end >= end)
  return { time: hhmmOf(start, contact.timeZone), outside: !covered }
}

// Iniciales para el círculo: «Ana López» → «AL».
export function initials(name) {
  const words = String(name || '')
    .replace(/@.*/, '')
    .split(/[\s._-]+/)
    .filter(Boolean)
  if (words.length === 0) return '?'
  return (words.length > 1 ? words[0][0] + words.at(-1)[0] : words[0][0]).toLocaleUpperCase('es')
}

/**
 * Disponibilidad de cada persona a la hora elegida, para la lista de participantes: Map id →
 * 'free' (Disponible) | 'busy' (Ocupado) | 'noprofile' (Sin perfil: aún no lo ha completado, así
 * que no se sabe). busyRows: los ocupados de cesi_free_busy en ese rato. noProfile: Set de ids.
 */
export function availabilityAt(busyRows, ids, start, end, noProfile = new Set()) {
  const busy = new Set(busyDuring(busyRows, ids, start, end))
  return new Map(ids.map((id) => [id, noProfile.has(id) ? 'noprofile' : busy.has(id) ? 'busy' : 'free']))
}

export const AVAILABILITY_LABELS = { free: 'Disponible', busy: 'Ocupado', noprofile: 'Sin perfil' }

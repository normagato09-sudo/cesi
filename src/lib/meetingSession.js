import { dateKey } from './recurrence'
import { makeId } from './store'

// Agenda y acta de cada sesión de una reunión. Se guardan dentro de la propia reunión:
// - Reunión única: agenda [{ id, text, done }], notes (texto del acta) y decisions [{ id, text }].
// - Reunión que se repite: agendaByDate, notesByDate y decisionsByDate { 'AAAA-MM-DD': ... },
//   una entrada por sesión (el día que le toca en la serie, aunque se haya movido).
// Las notas son las de siempre (notes / notesByDate): el texto del acta.
export const SESSION_FIELDS = [
  { field: 'notes', byDate: 'notesByDate', empty: '' },
  { field: 'agenda', byDate: 'agendaByDate', empty: [] },
  { field: 'decisions', byDate: 'decisionsByDate', empty: [] },
]

export const BY_DATE_FIELDS = SESSION_FIELDS.map((f) => f.byDate)

// Día (hora local) de una ocurrencia: la clave de los mapas por día.
export function sessionKeyOf(occurrence) {
  return dateKey(occurrence.originalStart || occurrence.start)
}

function isEmptyValue(value) {
  if (Array.isArray(value)) return value.length === 0
  return !String(value ?? '').trim()
}

function normalize(spec, value) {
  if (spec.field === 'notes') return typeof value === 'string' ? value : ''
  return Array.isArray(value) ? value.filter((item) => item && typeof item.text === 'string') : []
}

// Agenda y acta de una ocurrencia (o de una reunión única): { notes, agenda, decisions }.
export function sessionOf(occurrence) {
  const out = {}
  for (const spec of SESSION_FIELDS) {
    const value = !occurrence
      ? undefined
      : occurrence.recurrence
        ? occurrence[spec.byDate]?.[sessionKeyOf(occurrence)]
        : occurrence[spec.field]
    out[spec.field] = normalize(spec, value)
  }
  return out
}

export function isEmptySession(session) {
  return SESSION_FIELDS.every((spec) => isEmptyValue(session[spec.field]))
}

/**
 * Cambio que hay que guardar en la serie `series` para poner `changes` ({ notes, agenda,
 * decisions }, solo los que cambian) en la sesión de `occurrence`. En una serie, una sesión que
 * queda vacía se quita de su mapa.
 */
export function sessionPatch(series, occurrence, changes) {
  const patch = {}
  for (const spec of SESSION_FIELDS) {
    if (!(spec.field in changes)) continue
    const value = changes[spec.field]
    if (!series.recurrence) {
      patch[spec.field] = value
      continue
    }
    const key = sessionKeyOf(occurrence)
    const map = { ...(series[spec.byDate] || {}) }
    if (isEmptyValue(value)) delete map[key]
    else map[key] = value
    patch[spec.byDate] = map
  }
  return patch
}

// Una reunión única que pasa a repetirse: su agenda y su acta pasan a ser las de su primer día.
export function toSeriesSessionPatch(event, start) {
  const key = dateKey(new Date(start))
  const patch = {}
  for (const spec of SESSION_FIELDS) {
    const value = event[spec.field]
    if (value === undefined) continue
    patch[spec.byDate] = isEmptyValue(value) ? {} : { [key]: value }
    patch[spec.field] = spec.empty
  }
  return patch
}

// Una serie que deja de repetirse: queda la agenda y el acta del día `key`.
export function toSingleSessionPatch(series, key) {
  const patch = {}
  for (const spec of SESSION_FIELDS) {
    patch[spec.field] = series[spec.byDate]?.[key] ?? spec.empty
    patch[spec.byDate] = {}
  }
  return patch
}

/**
 * Sesiones anteriores de una reunión que se repite (las que tienen algo escrito), de la más
 * reciente a la más antigua: [{ key: 'AAAA-MM-DD', notes, agenda, decisions }].
 */
export function pastSessions(occurrence) {
  if (!occurrence?.recurrence) return []
  const current = sessionKeyOf(occurrence)
  const keys = new Set()
  for (const spec of SESSION_FIELDS) {
    for (const key of Object.keys(occurrence[spec.byDate] || {})) if (key < current) keys.add(key)
  }
  return [...keys]
    .sort()
    .reverse()
    .map((key) => {
      const session = { key }
      for (const spec of SESSION_FIELDS) session[spec.field] = normalize(spec, occurrence[spec.byDate]?.[key])
      return session
    })
    .filter((s) => !isEmptySession(s))
}

export function newAgendaItem(text) {
  return { id: makeId('item'), text, done: false }
}

export function newDecision(text) {
  return { id: makeId('item'), text }
}

// Mueve el elemento `index` una posición arriba (-1) o abajo (+1).
export function moveItem(list, index, delta) {
  const target = index + delta
  if (target < 0 || target >= list.length) return list
  const out = [...list]
  ;[out[index], out[target]] = [out[target], out[index]]
  return out
}

import { addDays, differenceInCalendarDays, endOfDay, parseISO, subDays } from 'date-fns'
import { dateKey, exceptionOf, expandEvent } from './recurrence'

// Cambios en reuniones que se repiten: solo un día, ese día y los siguientes, o toda la serie.
// Las funciones son puras: devuelven lo que hay que guardar y App lo guarda.
//
// Un día cambiado o cancelado se guarda en la propia serie, en exceptions { 'AAAA-MM-DD': ... }
// (ver recurrence.js). Las notas de cada día (notesByDate) usan la misma clave.

export const SCOPES = {
  THIS: 'this',
  FOLLOWING: 'following',
  ALL: 'all',
}

// Campos que puede cambiar un solo día (además de la hora).
export const EXCEPTION_FIELDS = [
  'title',
  'category',
  'tags',
  'participantIds',
  'guests',
  'participants',
  'projectId',
  'description',
  'meetLink',
  'allDay',
  'reminder',
]

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const toISO = (d) => new Date(d).toISOString()

// Clave del día de la serie al que corresponde la ocurrencia.
export function occurrenceKeyOf(occurrence) {
  return dateKey(occurrence.originalStart || occurrence.start)
}

// Hora que le toca a la ocurrencia según la serie (sin su excepción).
export function seriesTimesOf(series, occurrence) {
  const start = new Date(occurrence.originalStart || occurrence.start)
  return { start, end: new Date(start.getTime() + (new Date(series.end) - new Date(series.start))) }
}

// Parte un mapa por días ({ 'AAAA-MM-DD': x }) en los días anteriores a `key` y el resto.
function splitByKey(map, key) {
  const before = {}
  const after = {}
  for (const [k, v] of Object.entries(map || {})) {
    if (k < key) before[k] = v
    else after[k] = v
  }
  return { before, after }
}

// Mueve las claves de un mapa por días `days` días (si una reunión pasa, p. ej., del lunes al martes).
function shiftKeys(map, days) {
  if (!days) return { ...(map || {}) }
  const out = {}
  for (const [k, v] of Object.entries(map || {})) out[dateKey(addDays(parseISO(k), days))] = v
  return out
}

// Los campos que se pueden cambiar un solo día.
function fieldsOf(changes) {
  const out = {}
  for (const f of EXCEPTION_FIELDS) if (f in changes) out[f] = changes[f]
  return out
}

/**
 * "Solo este día": guarda `changes` ({ start, end, title, participantIds, ... }) como excepción
 * de ese día. Solo se guardan los campos que quedan distintos de la serie; si no queda ninguno,
 * el día vuelve a ser como la serie. Devuelve el cambio para la serie ({ exceptions }).
 */
export function editOccurrencePatch(series, occurrence, changes) {
  const key = occurrenceKeyOf(occurrence)
  const original = seriesTimesOf(series, occurrence)
  const current = exceptionOf(series, key) || {}
  const merged = { ...current, ...fieldsOf(changes) }
  if (changes.start) merged.start = toISO(changes.start)
  if (changes.end) merged.end = toISO(changes.end)

  const exception = {}
  for (const f of EXCEPTION_FIELDS) {
    if (f in merged && !same(merged[f], series[f])) exception[f] = merged[f]
  }
  if (merged.start && new Date(merged.start).getTime() !== original.start.getTime()) exception.start = merged.start
  if (merged.end && new Date(merged.end).getTime() !== original.end.getTime()) exception.end = merged.end

  const exceptions = { ...(series.exceptions || {}) }
  if (Object.keys(exception).length > 0) exceptions[key] = exception
  else delete exceptions[key]
  return { exceptions }
}

// "Solo este día" al borrar: ese día queda cancelado.
export function cancelOccurrencePatch(series, occurrence) {
  return { exceptions: { ...(series.exceptions || {}), [occurrenceKeyOf(occurrence)]: { cancelled: true } } }
}

// "Volver a como era en la serie": quita la excepción de ese día.
export function restoreOccurrencePatch(series, occurrence) {
  const exceptions = { ...(series.exceptions || {}) }
  delete exceptions[occurrenceKeyOf(occurrence)]
  return { exceptions }
}

// ¿Es el primer día de la serie? Entonces "este y los siguientes" es toda la serie.
export function isFirstOccurrence(series, occurrence) {
  return occurrenceKeyOf(occurrence) <= dateKey(series.start)
}

// Nueva hora a partir del cambio hecho en una ocurrencia. Si la hora que se veía no ha cambiado,
// se queda la de la serie (aunque ese día tuviera una hora propia).
function movedTimes(series, occurrence, changes) {
  const original = seriesTimesOf(series, occurrence)
  const shownStart = new Date(occurrence.start)
  const shownEnd = new Date(occurrence.end)
  const newStart = changes.start ? new Date(changes.start) : shownStart
  const newEnd = changes.end ? new Date(changes.end) : shownEnd
  if (newStart.getTime() === shownStart.getTime() && newEnd.getTime() === shownEnd.getTime()) {
    return { start: original.start, end: original.end, dayDelta: 0, changed: false }
  }
  return { start: newStart, end: newEnd, dayDelta: differenceInCalendarDays(newStart, original.start), changed: true }
}

/**
 * "Toda la serie": aplica `changes` a la serie. Un cambio de hora (o de día) hecho en una
 * ocurrencia se traslada a toda la serie desde su primer día; las notas y las excepciones se
 * mueven con ella si cambia de día. Si deja de repetirse, queda solo ese día (con sus notas).
 */
export function editSeriesPatch(series, occurrence, changes) {
  const moved = movedTimes(series, occurrence, changes)
  const patch = { ...changes }
  delete patch.start
  delete patch.end

  if ('recurrence' in changes && !changes.recurrence && series.recurrence) {
    return {
      ...patch,
      start: toISO(moved.start),
      end: toISO(moved.end),
      notes: series.notesByDate?.[occurrenceKeyOf(occurrence)] || '',
      notesByDate: {},
      exceptions: {},
    }
  }

  let start = new Date(series.start)
  let end = new Date(series.end)
  if (moved.changed) {
    start = addDays(start, moved.dayDelta)
    start.setHours(moved.start.getHours(), moved.start.getMinutes(), moved.start.getSeconds(), 0)
    end = new Date(start.getTime() + (moved.end - moved.start))
  }
  const out = { ...patch, start: toISO(start), end: toISO(end) }
  if (moved.dayDelta) {
    out.notesByDate = shiftKeys(series.notesByDate, moved.dayDelta)
    out.exceptions = shiftKeys(series.exceptions, moved.dayDelta)
  }
  return out
}

/**
 * "Este y los siguientes": la serie termina el día anterior y desde ese día empieza una serie
 * nueva con los cambios. Las notas y las excepciones de cada día se quedan en la serie que
 * corresponde a su fecha. Devuelve { seriesPatch, newEvent }, o null si es el primer día (entonces
 * se cambia toda la serie).
 */
export function splitSeries(series, occurrence, changes) {
  if (isFirstOccurrence(series, occurrence)) return null
  const key = occurrenceKeyOf(occurrence)
  const original = seriesTimesOf(series, occurrence)
  const moved = movedTimes(series, occurrence, changes)
  const notes = splitByKey(series.notesByDate, key)
  const exceptions = splitByKey(series.exceptions, key)
  // Ese día pasa a tener los datos de la serie nueva.
  delete exceptions.after[key]

  const seriesPatch = {
    recurrence: { ...series.recurrence, until: endOfDay(subDays(original.start, 1)).toISOString() },
    notesByDate: notes.before,
    exceptions: exceptions.before,
  }

  const copy = { ...series }
  for (const f of ['id', 'createdAt', 'updatedAt', 'notes', 'notesByDate', 'exceptions']) delete copy[f]
  const recurrence = 'recurrence' in changes ? changes.recurrence : series.recurrence
  const newEvent = { ...copy, ...changes, start: toISO(moved.start), end: toISO(moved.end), recurrence }
  const laterNotes = shiftKeys(notes.after, moved.dayDelta)
  if (recurrence) {
    newEvent.notesByDate = laterNotes
    newEvent.exceptions = shiftKeys(exceptions.after, moved.dayDelta)
  } else {
    newEvent.notes = laterNotes[dateKey(moved.start)] || ''
  }
  return { seriesPatch, newEvent }
}

/**
 * Borrar "este y los siguientes": la serie termina el día anterior (y se quitan las notas y las
 * excepciones de los días borrados). Devuelve null si es el primer día (se borra toda la serie).
 */
export function truncateSeriesPatch(series, occurrence) {
  if (isFirstOccurrence(series, occurrence)) return null
  const key = occurrenceKeyOf(occurrence)
  const original = seriesTimesOf(series, occurrence)
  return {
    recurrence: { ...series.recurrence, until: endOfDay(subDays(original.start, 1)).toISOString() },
    notesByDate: splitByKey(series.notesByDate, key).before,
    exceptions: splitByKey(series.exceptions, key).before,
  }
}

/**
 * Ocurrencia con ese id (el de una reunión o "serie::inicio" de un día de una serie), p. ej.
 * para abrir la reunión desde una notificación. null si ya no existe o ese día está cancelado.
 */
export function findOccurrence(rawEvents, id) {
  if (!id) return null
  const [seriesId, iso] = String(id).split('::')
  const series = rawEvents.find((ev) => ev.id === seriesId)
  if (!series) return null
  if (!iso) return expandEvent(series, new Date(-8.64e15), new Date(8.64e15))[0] || null
  // Un día cambiado puede haberse movido: se busca con margen alrededor del día que le tocaba.
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  return expandEvent(series, addDays(at, -400), addDays(at, 400)).find((o) => o.id === id) || null
}

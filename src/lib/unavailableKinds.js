import { addDays, differenceInCalendarDays, format, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'

// Tipo de una franja "No disponible" de todo el día (events.data.unavailableKind): 'vacation'
// (Vacaciones) u 'other' (Otro). Ya no hay "Festivo": las franjas guardadas como 'holiday' se
// conservan tal cual, pero se muestran y funcionan como Vacaciones. Las antiguas (sin tipo) y las que
// no son de todo el día cuentan como 'other'.
// Puede durar varios días (del 22/12 al 06/01): una sola franja de start (00:00 del primer día) a
// end (00:00 del día siguiente al último).
// Ya no hay nota: la que tuvieran (events.data.unavailableNote o, en las antiguas, el motivo del
// título; ver unavailableNoteOf) se conserva en los datos pero no se muestra ni se edita. El título
// que se ve sale solo del tipo (ver eventTitle). La página pública /reservar dice solo
// "No disponible: vacaciones". No afecta al Resumen.

export const UNAVAILABLE_KINDS = [
  { value: 'vacation', label: 'Vacaciones' },
  { value: 'other', label: 'Otro' },
]

// Tipos guardados que cuentan como vacaciones ('holiday': los antiguos festivos).
const VACATION_KINDS = ['vacation', 'holiday']

export function unavailableKindOf(event) {
  if (!event?.isUnavailable || !event.allDay) return 'other'
  return VACATION_KINDS.includes(event.unavailableKind) ? 'vacation' : 'other'
}

// ¿Vacaciones? (lo que se distingue en el calendario y en /reservar).
export function isMarkedDayOff(event) {
  return unavailableKindOf(event) !== 'other'
}

export function kindLabel(kind) {
  return kind === 'vacation' ? 'Vacaciones' : 'Otro'
}

export function cleanNote(note) {
  return (note || '').replace(/\s+/g, ' ').trim()
}

// Título de una franja "No disponible": "Vacaciones" o "No disponible" (sin nota).
export function unavailableTitle(kind) {
  return kind === 'vacation' ? 'Vacaciones' : 'No disponible'
}

// Título que se ve de cualquier reunión o franja: el de las franjas sale de su tipo (así las
// antiguas con nota o de festivo se ven como las nuevas, sin cambiar lo guardado).
export function eventTitle(event) {
  return event?.isUnavailable ? unavailableTitle(unavailableKindOf(event)) : event?.title || ''
}

// Nota de una franja "No disponible" (events.data.unavailableNote). Ya no hay campo "Motivo": en
// las antiguas sin nota, su motivo (lo que va detrás de "No disponible: " en el título) hace de
// nota. No se cambia nada guardado.
export function unavailableNoteOf(event) {
  if (!event?.isUnavailable) return ''
  if (cleanNote(event.unavailableNote)) return cleanNote(event.unavailableNote)
  const legacy = /^No disponible:\s*(.+)$/.exec(event.title || '')
  return legacy ? cleanNote(legacy[1]) : ''
}

// Número de días que ocupa una franja de todo el día (1 si es de un solo día).
export function allDaySpanDays(event) {
  return Math.max(1, differenceInCalendarDays(new Date(event.end), new Date(event.start)))
}

// "lunes, 22 de diciembre" o "del 22 de diciembre al 6 de enero".
export function allDayRangeText(event) {
  const start = new Date(event.start)
  const days = allDaySpanDays(event)
  if (days === 1) return format(start, "EEEE, d 'de' MMMM", { locale: es })
  const last = addDays(start, days - 1)
  return `del ${format(start, "d 'de' MMMM", { locale: es })} al ${format(last, "d 'de' MMMM", { locale: es })}`
}

/**
 * Días de vacaciones (también los antiguos festivos) entre `from` y `to` (incl.) según las
 * ocurrencias ya expandidas: [{ date: 'AAAA-MM-DD', kind: 'vacation' }] ordenados.
 * Es lo único que se publica de estas franjas para /reservar (ni título ni nota).
 */
export function daysOff(occurrences, from, to) {
  const byDay = new Map()
  const first = startOfDay(from)
  const last = startOfDay(to)
  for (const ev of occurrences) {
    const kind = unavailableKindOf(ev)
    if (kind === 'other') continue
    for (let d = startOfDay(new Date(ev.start)); d < new Date(ev.end); d = addDays(d, 1)) {
      if (d < first || d > last) continue
      const key = format(d, 'yyyy-MM-dd')
      byDay.set(key, kind)
    }
  }
  return [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, kind]) => ({ date, kind }))
}

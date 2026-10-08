import { addDays, differenceInCalendarDays, format, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'

// Tipo de una franja "No disponible" de todo el día (events.data.unavailableKind):
//   'vacation' (Vacaciones), 'holiday' (Festivo) u 'other' (Otro, con los motivos de siempre).
// Puede durar varios días (del 22/12 al 06/01): una sola franja de start (00:00 del primer día)
// a end (00:00 del día siguiente al último). Las de vacaciones y festivo llevan una nota opcional
// (events.data.unavailableNote, p. ej. "Navidad") que solo se ve en la app: la página pública
// /reservar dice solo "No disponible: vacaciones" o "Festivo". Las franjas antiguas (sin tipo) y
// las que no son de todo el día cuentan como 'other'. No afecta al Resumen.

export const UNAVAILABLE_KINDS = [
  { value: 'vacation', label: 'Vacaciones' },
  { value: 'holiday', label: 'Festivo' },
  { value: 'other', label: 'Otro' },
]

const LABELS = { vacation: 'Vacaciones', holiday: 'Festivo' }

export function unavailableKindOf(event) {
  if (!event?.isUnavailable || !event.allDay) return 'other'
  return LABELS[event.unavailableKind] ? event.unavailableKind : 'other'
}

// ¿Vacaciones o festivo? (lo que se distingue en el calendario y en /reservar).
export function isMarkedDayOff(event) {
  return unavailableKindOf(event) !== 'other'
}

export function kindLabel(kind) {
  return LABELS[kind] || 'Otro'
}

// Título de la franja: "Vacaciones" o "Festivo", con la nota si la hay ("Vacaciones: Navidad").
export function dayOffTitle(kind, note = '') {
  const clean = (note || '').replace(/\s+/g, ' ').trim()
  return clean ? `${kindLabel(kind)}: ${clean}` : kindLabel(kind)
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
 * Días de vacaciones o festivo entre `from` y `to` (incl.) según las ocurrencias ya expandidas:
 * [{ date: 'AAAA-MM-DD', kind }] ordenados. Si un día tiene los dos, gana vacaciones.
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
      if (byDay.get(key) !== 'vacation') byDay.set(key, kind)
    }
  }
  return [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, kind]) => ({ date, kind }))
}

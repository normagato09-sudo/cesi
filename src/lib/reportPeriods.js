import { addDays, addMonths, addWeeks, differenceInCalendarDays, format, parseISO, startOfDay, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { dateKey } from './recurrence'
import { weekStartOf } from './weeklyReport'

// Periodos del Resumen. Un periodo es { kind, start, end (sin incluir), prevStart, prevEnd } y se
// compara con el anterior: la semana, el mes o los 3 meses de antes, o (personalizado) los mismos
// días justo antes.

export const PERIOD_KINDS = [
  { id: 'week', label: 'Esta semana' },
  { id: 'month', label: 'Este mes' },
  { id: 'quarter', label: 'Últimos 3 meses' },
  { id: 'custom', label: 'Personalizado' },
]

// Máximo de días de un periodo personalizado (para que el cálculo siga siendo rápido).
export const MAX_CUSTOM_DAYS = 731

const PREVIOUS_LABEL = {
  week: 'respecto a la semana anterior',
  month: 'respecto al mes anterior',
  quarter: 'respecto a los 3 meses anteriores',
  custom: 'respecto a los días anteriores',
}

function range(kind, start, end, prevStart) {
  return { kind, start, end, prevStart, prevEnd: start, previousLabel: PREVIOUS_LABEL[kind] }
}

/**
 * Periodo de tipo `kind` que contiene `anchor` ("Últimos 3 meses": el mes de `anchor` y los dos
 * anteriores). Para 'custom', `custom` = { from, to } ('AAAA-MM-DD', ambos incluidos).
 */
export function periodOf(kind, anchor, custom = null) {
  if (kind === 'week') {
    const start = weekStartOf(anchor)
    return range(kind, start, addWeeks(start, 1), addWeeks(start, -1))
  }
  if (kind === 'month') {
    const start = startOfMonth(anchor)
    return range(kind, start, addMonths(start, 1), addMonths(start, -1))
  }
  if (kind === 'quarter') {
    const end = addMonths(startOfMonth(anchor), 1)
    const start = addMonths(end, -3)
    return range(kind, start, end, addMonths(start, -3))
  }
  const start = startOfDay(parseISO(custom.from))
  const end = addDays(startOfDay(parseISO(custom.to)), 1)
  return range('custom', start, end, addDays(start, -differenceInCalendarDays(end, start)))
}

// El periodo siguiente (`dir` = 1) o anterior (−1) del mismo tipo y duración.
export function shiftPeriod(period, dir) {
  if (period.kind === 'custom') {
    const days = differenceInCalendarDays(period.end, period.start) * dir
    return periodOf('custom', null, { from: dateKey(addDays(period.start, days)), to: dateKey(addDays(period.end, days - 1)) })
  }
  const step = { week: (d) => addWeeks(d, dir), month: (d) => addMonths(d, dir), quarter: (d) => addMonths(d, 3 * dir) }[period.kind]
  // Se parte del último día: en "Últimos 3 meses" el periodo es el que termina en ese mes.
  return periodOf(period.kind, step(addDays(period.end, -1)))
}

// ¿Es el periodo actual (contiene hoy)?
export function isCurrentPeriod(period, now) {
  return period.start <= now && now < period.end
}

// Mensaje de error de un periodo personalizado, o null si es válido.
export function validateCustom({ from, to }) {
  if (!from || !to) return 'Elige las dos fechas.'
  if (to < from) return 'La fecha final es anterior a la inicial.'
  if (differenceInCalendarDays(parseISO(to), parseISO(from)) + 1 > MAX_CUSTOM_DAYS) return 'Elige como mucho 2 años.'
  return null
}

// "28 sept – 4 oct 2026", "octubre 2026", "agosto – octubre 2026".
export function periodLabel(period) {
  const { kind, start } = period
  const last = addDays(period.end, -1)
  if (kind === 'month') return format(start, 'MMMM yyyy', { locale: es })
  if (kind === 'quarter') {
    const sameYear = start.getFullYear() === last.getFullYear()
    return `${format(start, sameYear ? 'MMMM' : 'MMMM yyyy', { locale: es })} – ${format(last, 'MMMM yyyy', { locale: es })}`
  }
  if (dateKey(start) === dateKey(last)) return format(start, "d 'de' MMMM yyyy", { locale: es })
  if (start.getFullYear() !== last.getFullYear()) {
    return `${format(start, 'd MMM yyyy', { locale: es })} – ${format(last, 'd MMM yyyy', { locale: es })}`
  }
  if (start.getMonth() === last.getMonth()) return `${format(start, 'd')}–${format(last, "d 'de' MMMM yyyy", { locale: es })}`
  return `${format(start, "d 'de' MMMM", { locale: es })} – ${format(last, "d 'de' MMMM yyyy", { locale: es })}`
}

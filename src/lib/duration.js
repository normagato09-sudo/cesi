import { addMonths, differenceInCalendarDays } from 'date-fns'

// Duraciones por calendario (antigüedad, tiempo en CESI y duración de cada rol).

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * Tiempo entre dos fechas por calendario: meses completos y días que sobran.
 * Del 30/07 al 30/08 es 1 mes; del 30/07 al 24/09, 1 mes y 25 días. En los finales de mes se
 * cuenta hasta el último día del mes siguiente: del 31/01 al 28/02 es 1 mes.
 */
export function calendarSpan(from, to) {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  // addMonths ajusta al último día del mes (31/01 + 1 mes = 28/02).
  while (months > 0 && addMonths(from, months) > to) months -= 1
  const days = differenceInCalendarDays(to, addMonths(from, months))
  return { months, days }
}

// "3 semanas", "5 días" (menos de un mes)
export function shortSpan(days) {
  if (days >= 7) return plural(Math.floor(days / 7), 'semana', 'semanas')
  return plural(days, 'día', 'días')
}

// "1 mes y 25 días", "2 meses", "1 año y 2 meses", "2 años" (un mes o más)
export function longSpan({ months, days }) {
  if (months < 12) return days > 0 ? `${plural(months, 'mes', 'meses')} y ${plural(days, 'día', 'días')}` : plural(months, 'mes', 'meses')
  const years = Math.floor(months / 12)
  const rest = months % 12
  return rest > 0 ? `${plural(years, 'año', 'años')} y ${plural(rest, 'mes', 'meses')}` : plural(years, 'año', 'años')
}

// Cualquier duración: "5 días", "3 semanas", "1 mes y 25 días", "1 año y 7 meses".
export function spanText(span) {
  return span.months >= 1 ? longSpan(span) : shortSpan(span.days)
}

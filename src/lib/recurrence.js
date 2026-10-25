import { addDays, addWeeks, addMonths, addYears, endOfDay, format, getDaysInMonth, isSameDay, set, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'

// Repeticiones de las reuniones. Las fechas son las del dispositivo; `toDate` permite crearlas de
// otra forma (p. ej. en otra zona horaria) si hiciera falta.
const localDate = (value) => new Date(value)

// Repetición de una serie: { freq, interval, monthlyBy, until }.
//   freq: 'daily' | 'weekly' | 'monthly' | 'yearly'.
//   interval: cada cuántos días/semanas/meses/años (1 si falta: las series antiguas no lo tienen).
//   monthlyBy (solo mensuales): 'date' (o sin valor) el mismo día del mes; 'nth' el mismo día de
//   la semana en la misma posición (el 2.º lunes); 'last' el último de ese día de la semana.
const STEP = { daily: addDays, weekly: addWeeks, monthly: addMonths, yearly: addYears }
const WEEKDAY_MODES = ['nth', 'last']
const MAX_OCCURRENCES = 3000
const DEFAULT_HORIZON_YEARS = 2

// Día (hora local, 'AAAA-MM-DD') con el que se identifica cada día de una serie: clave de
// notesByDate y de exceptions. Es el día que le toca según la serie, aunque se haya movido.
export function dateKey(date) {
  // Una fecha con zona (TZDate) se formatea en su zona.
  return format(date instanceof Date ? date : new Date(date), 'yyyy-MM-dd')
}

// Excepciones de una serie (exceptions { 'AAAA-MM-DD': cambio }):
//   { cancelled: true }  ese día no hay reunión;
//   { start, end, title, participantIds, ... }  ese día tiene sus propios datos (solo los que
//   cambian respecto a la serie).
export function exceptionOf(event, key) {
  const exception = event.exceptions?.[key]
  return exception && typeof exception === 'object' ? exception : null
}

export function intervalOf(recurrence) {
  const n = Math.floor(Number(recurrence?.interval))
  return n >= 1 ? n : 1
}

// Posición de una fecha entre los días de su mes con su mismo día de la semana: el 2.º lunes
// (nth 2) y si es el último lunes del mes (isLast).
export function weekdayPosition(date) {
  const d = date instanceof Date ? date : new Date(date)
  return {
    weekday: d.getDay(),
    nth: Math.ceil(d.getDate() / 7),
    isLast: d.getDate() + 7 > getDaysInMonth(d),
  }
}

// El mismo día de la semana que `base` (en su posición o el último del mes) `months` meses
// después, a la misma hora. null si ese mes no lo tiene (p. ej. sin 5.º lunes).
function weekdayInMonth(base, months, monthlyBy) {
  const { weekday, nth } = weekdayPosition(base)
  const first = startOfMonth(addMonths(startOfMonth(base), months))
  const days = getDaysInMonth(first)
  let day
  if (monthlyBy === 'last') {
    const lastWeekday = (first.getDay() + days - 1) % 7
    day = days - ((lastWeekday - weekday + 7) % 7)
  } else {
    day = 1 + ((weekday - first.getDay() + 7) % 7) + (nth - 1) * 7
    if (day > days) return null
  }
  return atTimeOf(set(first, { date: day }), base)
}

// `day` a la hora de reloj de `time`.
function atTimeOf(day, time) {
  return set(day, {
    hours: time.getHours(),
    minutes: time.getMinutes(),
    seconds: time.getSeconds(),
    milliseconds: time.getMilliseconds(),
  })
}

// Genera las ocurrencias de un evento (único o repetitivo) que solapan [rangeStart, rangeEnd).
// En las series, los días cancelados no salen y los cambiados llevan sus propios datos
// (isException: true). originalStart es la hora que le tocaba según la serie.
export function expandEvent(event, rangeStart, rangeEnd, { toDate = localDate } = {}) {
  const baseStart = toDate(event.start)
  const baseEnd = toDate(event.end)
  const duration = baseEnd - baseStart

  if (!event.recurrence) {
    return baseStart < rangeEnd && baseEnd > rangeStart
      ? [{ ...event, start: baseStart, end: baseEnd, seriesId: event.id, isRecurringInstance: false }]
      : []
  }

  const { freq, until, monthlyBy } = event.recurrence
  const step = STEP[freq]
  if (!step) return []
  const interval = intervalOf(event.recurrence)
  const byWeekday = freq === 'monthly' && WEEKDAY_MODES.includes(monthlyBy)

  const untilDate = until ? endOfDay(toDate(until)) : endOfDay(addYears(baseStart, DEFAULT_HORIZON_YEARS))
  const hasExceptions = event.exceptions && Object.keys(event.exceptions).length > 0
  // Si empieza y acaba el mismo día, cada día acaba a la misma hora (no a inicio + duración): así
  // una reunión hasta las 23:59 no pasa al día siguiente el día del cambio de hora.
  const sameDay = isSameDay(baseStart, baseEnd)
  const occurrences = []

  // Cada ocurrencia se calcula desde `baseStart` (no desde la anterior) para que un mensual/anual
  // anclado en el día 29-31 no vaya "derivando" hacia atrás tras pasar por un mes más corto.
  for (let index = 0; index < MAX_OCCURRENCES; index++) {
    const cursorStart = byWeekday
      ? weekdayInMonth(baseStart, index * interval, monthlyBy)
      : step(baseStart, index * interval)
    if (!cursorStart) {
      // Ese mes no tiene ese día: se salta.
      if (startOfMonth(addMonths(startOfMonth(baseStart), index * interval)) > untilDate) break
      continue
    }
    if (cursorStart > untilDate) break
    let start = cursorStart
    let end = sameDay ? atTimeOf(cursorStart, baseEnd) : new Date(cursorStart.getTime() + duration)
    const key = hasExceptions ? dateKey(cursorStart) : null
    const exception = key ? exceptionOf(event, key) : null
    if (exception?.cancelled) continue
    if (exception) {
      if (exception.start) start = new Date(exception.start)
      if (exception.end) end = new Date(exception.end)
    }
    if (end > rangeStart && start < rangeEnd) {
      const occurrence = {
        ...event,
        id: `${event.id}::${cursorStart.toISOString()}`,
        seriesId: event.id,
        isRecurringInstance: true,
        originalStart: cursorStart,
        start,
        end,
      }
      if (exception) {
        const fields = { ...exception }
        delete fields.start
        delete fields.end
        delete fields.cancelled
        Object.assign(occurrence, fields, { isException: true })
      }
      occurrences.push(occurrence)
    }
  }
  return occurrences
}

export function expandEvents(events, rangeStart, rangeEnd, options) {
  return events.flatMap((ev) => expandEvent(ev, rangeStart, rangeEnd, options))
}

// 1.er, 2.º, 3.er, 4.º
export function ordinal(n) {
  return n === 1 || n === 3 ? `${n}.er` : `${n}.º`
}

export function weekdayName(date) {
  return format(date instanceof Date ? date : new Date(date), 'EEEE', { locale: es })
}

const UNITS = {
  daily: ['día', 'días'],
  weekly: ['semana', 'semanas'],
  monthly: ['mes', 'meses'],
  yearly: ['año', 'años'],
}

export function unitLabel(freq, interval) {
  const unit = UNITS[freq]
  return unit ? unit[interval === 1 ? 0 : 1] : ''
}

// Texto de una repetición: "Cada semana", "Cada 15 días", "El 1.er lunes de cada mes",
// "El último viernes cada 3 meses". `start` es un día de la serie (de él sale el día de la semana
// y su posición en el mes).
export function recurrenceLabel(recurrence, start) {
  if (!recurrence || !UNITS[recurrence.freq]) return ''
  const { freq, monthlyBy } = recurrence
  const interval = intervalOf(recurrence)
  if (freq === 'monthly' && WEEKDAY_MODES.includes(monthlyBy) && start) {
    const which = monthlyBy === 'last' ? 'último' : ordinal(weekdayPosition(start).nth)
    const every = interval === 1 ? 'de cada mes' : `cada ${interval} meses`
    return `El ${which} ${weekdayName(start)} ${every}`
  }
  return interval === 1 ? `Cada ${unitLabel(freq, 1)}` : `Cada ${interval} ${unitLabel(freq, interval)}`
}

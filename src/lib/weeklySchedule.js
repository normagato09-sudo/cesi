// Horario semanal con varias franjas por día. Se usa para "Mi horario" y para la
// disponibilidad de los contactos. Formato:
//   [{ day: 0..6 (como Date#getDay, 0 = domingo), enabled: boolean, slots: [{ start: 'HH:mm', end: 'HH:mm' }] }]

export const WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
// Lunes..domingo, igual que el resto del calendario.
export const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

export function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

// Ningún rango pasa de las 23:59 del mismo día (no hay franjas que crucen la medianoche).
export const DAY_END = '23:59'
export const DAY_END_MINUTES = 23 * 60 + 59

// Fin de una franja tal como se usa: un fin '00:00' o '24:00' (datos guardados antes de este
// límite) cuenta como las 23:59 de ese mismo día. Lo guardado no se toca.
export function clampEnd(hhmm) {
  const minutes = timeToMinutes(hhmm)
  return minutes === 0 || minutes > DAY_END_MINUTES ? DAY_END : hhmm
}

export function minutesToTime(total) {
  const clamped = Math.max(0, Math.min(DAY_END_MINUTES, total))
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}

export function emptyWeek() {
  return [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, enabled: false, slots: [] }))
}

function sortSlots(slots) {
  return [...slots].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))
}

// Acepta el formato antiguo ({ day, enabled, start, end }) y devuelve siempre el nuevo.
export function normalizeWeek(raw, fallback = emptyWeek()) {
  if (!Array.isArray(raw)) return fallback
  const byDay = new Map(raw.filter((e) => e && Number.isInteger(e.day)).map((e) => [e.day, e]))
  if (byDay.size !== 7) return fallback
  return [0, 1, 2, 3, 4, 5, 6].map((day) => {
    const entry = byDay.get(day)
    let slots = Array.isArray(entry.slots) ? entry.slots : entry.start && entry.end ? [{ start: entry.start, end: entry.end }] : []
    slots = slots
      .filter((s) => s && typeof s.start === 'string' && typeof s.end === 'string')
      .map((s) => ({ ...s, end: clampEnd(s.end) }))
    return { day, enabled: !!entry.enabled && slots.length > 0, slots: sortSlots(slots) }
  })
}

// Franjas activas de un día de la semana (lista vacía si ese día no está habilitado).
export function slotsForDay(week, dayOfWeek) {
  const entry = week.find((w) => w.day === dayOfWeek)
  return entry && entry.enabled ? entry.slots : []
}

export const SLOT_RULE = 'El fin tiene que ser posterior al inicio y como muy tarde a las 23:59 del mismo día.'

// ¿Termina la franja después de empezar y no más tarde de las 23:59?
export function isValidSlot({ start, end }) {
  if (!start || !end) return false
  const endMinutes = timeToMinutes(end)
  return endMinutes > timeToMinutes(start) && endMinutes <= DAY_END_MINUTES
}

// Devuelve un mensaje de error o null si el horario es válido.
export function validateWeek(week) {
  for (const entry of week) {
    if (!entry.enabled) continue
    if (entry.slots.length === 0) return `${WEEKDAY_LABELS[entry.day]}: añade al menos una franja o desactiva el día.`
    const sorted = sortSlots(entry.slots)
    for (let i = 0; i < sorted.length; i++) {
      const { start, end } = sorted[i]
      if (!start || !end) return `${WEEKDAY_LABELS[entry.day]}: completa las horas de todas las franjas.`
      if (!isValidSlot({ start, end })) {
        return `${WEEKDAY_LABELS[entry.day]}: la franja ${start}–${end} no es válida. ${SLOT_RULE}`
      }
      if (i > 0 && timeToMinutes(start) < timeToMinutes(sorted[i - 1].end)) {
        return `${WEEKDAY_LABELS[entry.day]}: las franjas ${sorted[i - 1].start}–${sorted[i - 1].end} y ${start}–${end} se solapan.`
      }
    }
  }
  return null
}

// Limpia el horario antes de guardarlo: ordena franjas y desactiva días sin franjas.
export function cleanWeek(week) {
  return week.map((entry) => ({
    day: entry.day,
    enabled: entry.enabled && entry.slots.length > 0,
    slots: sortSlots(entry.slots),
  }))
}

// Franjas del día `date` como intervalos de Date en la hora local.
export function slotIntervalsOn(week, date) {
  return slotsForDay(week, date.getDay()).map((slot) => {
    const start = new Date(date)
    start.setHours(0, timeToMinutes(slot.start), 0, 0)
    const end = new Date(date)
    end.setHours(0, timeToMinutes(clampEnd(slot.end)), 0, 0)
    return { start, end }
  })
}

// Copia las franjas del día `from` a los días `to` (activa o desactiva igual que el original).
export function copyDay(week, from, to) {
  const source = week.find((e) => e.day === from)
  if (!source) return week
  return week.map((e) => (to.includes(e.day) && e.day !== from ? { ...e, enabled: source.enabled, slots: source.slots.map((s) => ({ ...s })) } : e))
}

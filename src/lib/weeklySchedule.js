// Horario semanal con varias franjas por día. Se usa para mi horario habitual y para la
// disponibilidad de los contactos. Formato:
//   [{ day: 0..6 (como Date#getDay, 0 = domingo), enabled: boolean, slots: [{ start: 'HH:mm', end: 'HH:mm' }] }]

export const WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
// Lunes..domingo, igual que el resto del calendario.
export const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

export function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function minutesToTime(total) {
  const clamped = Math.max(0, Math.min(24 * 60, total))
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
    slots = slots.filter((s) => s && typeof s.start === 'string' && typeof s.end === 'string')
    return { day, enabled: !!entry.enabled && slots.length > 0, slots: sortSlots(slots) }
  })
}

// Franjas activas de un día de la semana (lista vacía si ese día no está habilitado).
export function slotsForDay(week, dayOfWeek) {
  const entry = week.find((w) => w.day === dayOfWeek)
  return entry && entry.enabled ? entry.slots : []
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
      if (timeToMinutes(end) <= timeToMinutes(start)) {
        return `${WEEKDAY_LABELS[entry.day]}: la franja ${start}–${end} debe terminar después de empezar.`
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
    end.setHours(0, timeToMinutes(slot.end), 0, 0)
    return { start, end }
  })
}

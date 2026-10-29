import { availabilityIntervals, contactWeek, hasAvailability } from './contactAvailability'
import { DAY_SHORT, datesFrom, instantAt, normalizeCourse, rangeInZone, sortScheduleSlots } from './courses'
import { WEEKDAY_DISPLAY_ORDER, clampEnd, minutesToTime, timeToMinutes } from './weeklySchedule'

// "Organizar horario" de un curso: cruza la disponibilidad del profesor (obligatoria) con la de
// los alumnos inscritos, cada uno en su zona horaria. No usa mi horario ni mi calendario: yo no
// estoy en las clases.

export const STEP_MINUTES = 30
export const MAX_PER_DAY = 3
export const MAX_PROPOSALS = 15

// Fechas de la semana que viene (de lunes a domingo, en la zona del profesor): se usan para
// convertir las horas con el cambio de hora real de esas fechas.
export function nextWeekDates(now, timeZone) {
  const dates = []
  let started = false
  for (const date of datesFrom(now, timeZone)) {
    if (!started && date.weekday === 1 && dates.length === 0 && date !== null) {
      // El lunes de hoy no cuenta: empieza el próximo lunes.
    }
    if (date.weekday === 1 && !started) {
      started = dates.length > 0 || isAfterToday(date, now, timeZone)
    }
    if (started) dates.push(date)
    else dates.push(null)
    if (dates.filter(Boolean).length === 7) break
  }
  return dates.filter(Boolean)
}

function isAfterToday(date, now, timeZone) {
  const first = datesFrom(now, timeZone).next().value
  return date.year !== first.year || date.month !== first.month || date.day !== first.day
}

// ¿Puede el alumno toda la clase [start, end)? null si no tiene disponibilidad (no se sabe).
export function studentCan(student, start, end) {
  if (!hasAvailability(student)) return null
  const free = availabilityIntervals(student, start, end) || []
  return free.some((i) => i.start <= start && i.end >= end)
}

/**
 * Franjas propuestas para una clase del curso, ordenadas por número de alumnos que pueden.
 * Solo dentro de la disponibilidad del profesor (cada STEP_MINUTES, con la clase entera dentro
 * de una de sus franjas). Cada propuesta:
 * { key, day, start, end ('HH:mm' en la zona del profesor), startAt, endAt (Date),
 *   can, cannot, unknown (alumnos que pueden, que no pueden y sin disponibilidad indicada) }
 * Como mucho MAX_PER_DAY por día (sin repetir franjas que se solapan con los mismos alumnos)
 * y MAX_PROPOSALS en total.
 */
export function proposeSlots({ course, teacher, students, now = new Date(), perDay = MAX_PER_DAY, limit = MAX_PROPOSALS }) {
  const week = contactWeek(teacher)
  if (!week || !hasAvailability(teacher)) return []
  const { classMinutes } = normalizeCourse(course)
  const tz = teacher.timeZone
  const candidates = []
  for (const date of nextWeekDates(now, tz)) {
    const entry = week.find((w) => w.day === date.weekday)
    if (!entry?.enabled) continue
    for (const slot of entry.slots) {
      const last = timeToMinutes(clampEnd(slot.end)) - classMinutes
      for (let m = timeToMinutes(slot.start); m <= last; m += STEP_MINUTES) {
        const start = minutesToTime(m)
        const { date: startAt, exists } = instantAt(date, start, tz)
        if (!exists) continue
        const endAt = new Date(startAt.getTime() + classMinutes * 60000)
        const can = []
        const cannot = []
        const unknown = []
        for (const s of students) {
          const result = studentCan(s, startAt, endAt)
          ;(result === null ? unknown : result ? can : cannot).push(s)
        }
        candidates.push({ key: `${date.weekday}-${start}`, day: date.weekday, start, end: minutesToTime(m + classMinutes), startAt, endAt, can, cannot, unknown })
      }
    }
  }

  const dayOrder = (day) => WEEKDAY_DISPLAY_ORDER.indexOf(day)
  candidates.sort((a, b) => b.can.length - a.can.length || dayOrder(a.day) - dayOrder(b.day) || a.startAt - b.startAt)

  const sameStudents = (a, b) => a.can.length === b.can.length && a.can.every((s) => b.can.includes(s))
  const overlaps = (a, b) => a.startAt < b.endAt && b.startAt < a.endAt
  const chosen = []
  for (const c of candidates) {
    if (chosen.length >= limit) break
    const sameDay = chosen.filter((x) => x.day === c.day)
    if (sameDay.length >= perDay) continue
    if (sameDay.some((x) => overlaps(x, c) && sameStudents(x, c))) continue
    chosen.push(c)
  }
  return chosen
}

// Alumnos que pueden ir a todas las franjas elegidas a la vez, los que no pueden a alguna y los
// que no tienen disponibilidad. Sin franjas elegidas, null.
export function combinedAttendance(selected, students) {
  if (selected.length === 0) return null
  const can = []
  const cannot = []
  const unknown = []
  for (const s of students) {
    if (!hasAvailability(s)) unknown.push(s)
    else if (selected.every((p) => p.can.includes(s))) can.push(s)
    else cannot.push(s)
  }
  return { can, cannot, unknown }
}

// Horario fijo que se guarda en el curso a partir de las franjas elegidas (en la zona del profesor).
export function scheduleFromSelection(selected, teacher) {
  return { timeZone: teacher.timeZone, slots: sortScheduleSlots(selected.map((p) => ({ day: p.day, start: p.start }))) }
}

// Hora de la propuesta en la zona de una persona: "Lun 18:00–19:00".
export function proposalInZone(proposal, timeZone) {
  return rangeInZone(proposal.startAt, proposal.endAt, timeZone)
}

export const DAY_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
export { DAY_SHORT }

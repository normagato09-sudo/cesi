import { localTimeZone, pad2, wallTime, zonePlace } from './timezones'

// Día y hora de una reunión en la zona horaria de quien la recibe (mensaje de confirmación y
// página pública /confirmar/<token>).

const WEEKDAY = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MONTH = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// { day: 'lunes 5 de octubre', time: '10:00', place: 'España', timeZone }. Sin zona, la del dispositivo.
export function meetingWhen(start, timeZone) {
  const tz = timeZone || localTimeZone()
  const w = wallTime(new Date(start), tz)
  return {
    day: `${WEEKDAY[w.weekday]} ${w.day} de ${MONTH[w.month - 1]}`,
    time: `${pad2(w.hour)}:${pad2(w.minute)}`,
    place: zonePlace(tz),
    timeZone: tz,
  }
}

// "1 h", "30 min", "1 h 30 min"
export function durationText(start, end) {
  const minutes = Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}

import { localTimeZone, wallTime, zonedDateTime } from './timezones'

// El calendario se ve en la zona del perfil de cada uno (si no tiene el perfil completo, en la del
// dispositivo). Las vistas (Mes, Semana, Día) trabajan con fechas «locales» del dispositivo; para
// verlas en otra zona, cada instante se pasa a una fecha local con la misma hora de reloj que tiene
// en esa zona («hora de pared»), y lo que se elige en la vista (un hueco, un arrastre) se pasa de
// vuelta al instante real. Si la zona es la del dispositivo, no se toca nada.

// Zona con la que se ve el calendario: la del perfil completo o la del dispositivo.
export function viewZone(profile) {
  return (profile?.completed_at && profile?.time_zone) || localTimeZone()
}

export function isDeviceZone(zone) {
  return !zone || zone === localTimeZone()
}

// Instante real → fecha local con la hora de reloj que tiene en la zona.
export function toWall(date, zone) {
  if (isDeviceZone(zone)) return date
  const w = wallTime(date, zone)
  return new Date(w.year, w.month - 1, w.day, w.hour, w.minute, w.second, date.getMilliseconds())
}

// Fecha local (hora de reloj en la zona) → instante real.
export function fromWall(date, zone) {
  if (isDeviceZone(zone)) return date
  const { date: real } = zonedDateTime(
    { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), hour: date.getHours(), minute: date.getMinutes() },
    zone,
  )
  return new Date(real.getTime() + date.getSeconds() * 1000 + date.getMilliseconds())
}

// Eventos para las vistas: con inicio y fin en hora de pared y el original en `real`.
export function eventsInZone(events, zone) {
  if (isDeviceZone(zone)) return events
  return events.map((ev) => ({ ...ev, start: toWall(new Date(ev.start), zone), end: toWall(new Date(ev.end), zone), real: ev }))
}

// El evento de verdad de uno de las vistas.
export function realEvent(ev) {
  return ev?.real || ev
}

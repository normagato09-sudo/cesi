import { addDaysKey, daysRange, keyOf, mondayOf } from './sharedCalendar'
import { OPEN_SHIFT_HOURS, entryMinutes, isOverdue } from './teamWork'

// «Mi equipo» en mi Inicio (solo la ceo): quién trabaja ahora, horas de la semana, tareas
// atrasadas, progreso por área, fichajes sin salida y reuniones compartidas de hoy y mañana.
// Todo con lo que ya hay en Supabase (partes 4, 6 y 7); nada nuevo en SQL.

const DAY_MS = 24 * 60 * 60 * 1000
const OPEN_MS = OPEN_SHIFT_HOURS * 3600000

// Nombre de una cuenta: el de su perfil, el de la cuenta o su email.
export function nameOf(id, profilesById, portalsById) {
  const p = profilesById.get(id)
  return portalsById.get(id)?.full_name?.trim() || p?.display_name?.trim() || p?.email || 'Sin nombre'
}

// Entradas sin salida: las de las últimas 16 horas (trabajando ahora) y las más antiguas (sin
// salida, para corregir). Cada una con su nombre y, las de ahora, los minutos que lleva.
export function splitOpenEntries(openRows, nameFor, now = new Date()) {
  const working = []
  const stale = []
  for (const e of openRows) {
    const since = new Date(e.clock_in)
    // De una cuenta eliminada: el nombre que tenía (owner_gone_name, parte 8).
    const row = { ...e, name: e.profile_id ? nameFor(e.profile_id) : `${e.owner_gone_name || 'Sin nombre'} (cuenta eliminada)`, can_fix: true }
    if (now - since < OPEN_MS) working.push({ ...row, minutes: Math.max(0, Math.round((now - since) / 60000)) })
    else stale.push(row)
  }
  working.sort((a, b) => new Date(a.clock_in) - new Date(b.clock_in))
  stale.sort((a, b) => new Date(b.clock_in) - new Date(a.clock_in))
  return { working, stale }
}

// Horas de la semana por persona de equipo (todas, aunque no hayan fichado), por nombre.
// [{ id, name, areaName, minutes, count, zero }]
export function weekHoursByPerson(members, entries, nameFor, areaNameOf) {
  return members
    .map((m) => {
      const own = entries.filter((e) => e.profile_id === m.id)
      const minutes = own.reduce((n, e) => n + entryMinutes(e), 0)
      return { id: m.id, name: nameFor(m.id), areaName: areaNameOf(m.area), minutes, count: own.length, zero: minutes === 0 }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

function daysBetween(fromKey, toKey) {
  const t = (k) => {
    const [y, m, d] = k.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((t(toKey) - t(fromKey)) / DAY_MS)
}

// Tareas atrasadas, de la más atrasada a la menos, con los días de retraso.
export function overdueTasks(tasks, todayKey) {
  return tasks
    .filter((t) => isOverdue(t, todayKey))
    .map((t) => ({ ...t, daysLate: daysBetween(t.due_date, todayKey) }))
    .sort((a, b) => b.daysLate - a.daysLate || a.title.localeCompare(b.title, 'es'))
}

/**
 * Progreso por área este mes: tareas con fecha límite este mes o, si no tienen fecha, creadas este
 * mes (en mi zona). [{ id, name, done, total }] para todas las áreas, en su orden.
 */
export function areaProgress(tasks, areas, todayKey, zone) {
  const month = todayKey.slice(0, 7)
  const inMonth = (t) => (t.due_date ? t.due_date.slice(0, 7) === month : keyOf(new Date(t.created_at), zone).slice(0, 7) === month)
  return areas.map((a) => {
    const own = tasks.filter((t) => t.area === a.id && inMonth(t))
    return { id: a.id, name: a.name, done: own.filter((t) => t.status === 'hecha').length, total: own.length }
  })
}

// [inicio, fin) de hoy y mañana en mi zona, y de esta semana (lunes a domingo).
export function panelRanges(now, zone) {
  const today = keyOf(now, zone)
  return { today, days: daysRange(today, 2, zone), week: daysRange(mondayOf(today), 7, zone), tomorrow: addDaysKey(today, 1) }
}

/**
 * Reuniones compartidas de hoy y mañana de todo el equipo, como las devuelve cesi_my_meetings
 * (para abrir su ficha), con mine (estoy en ella), accepted y invited (sin contar al organizador).
 * meetings: filas de shared_meetings; participants: filas de shared_meeting_participants.
 */
export function teamMeetings(meetings, participants, nameFor, meId) {
  return meetings
    .map((m) => {
      const people = participants.filter((p) => p.meeting_id === m.id)
      const me = people.find((p) => p.profile_id === meId)
      const guests = people.filter((p) => p.profile_id !== m.organizer_id)
      return {
        id: m.id,
        title: m.title,
        description: m.description,
        link: m.link,
        starts_at: m.starts_at,
        ends_at: m.ends_at,
        cancelled: !!m.cancelled_at,
        organizer_id: m.organizer_id,
        organizer_name: nameFor(m.organizer_id),
        my_status: me?.status || null,
        participants: people
          .map((p) => ({ id: p.profile_id, name: nameFor(p.profile_id), status: p.status }))
          .sort((a, b) => (a.id === m.organizer_id ? -1 : b.id === m.organizer_id ? 1 : a.name.localeCompare(b.name, 'es'))),
        mine: !!me,
        accepted: guests.filter((p) => p.status === 'accepted').length,
        invited: guests.length,
      }
    })
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
}

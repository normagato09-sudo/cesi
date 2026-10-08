import { addDays, parseISO } from 'date-fns'
import { readJSON, writeJSON } from './store'
import { normalizeWeek } from './weeklySchedule'

// Disponibilidad declarada semana a semana: ya no se usa (ahora hay un solo horario fijo, "Mi
// horario"). Las semanas declaradas se conservan en los datos, la sincronización y las copias, y
// la última sirve de punto de partida la primera vez que se abre "Mi horario".
//
// Documento (cesi_weekly_availability_v1), uno por semana, con id = 'wk_' + lunes:
//   { id: 'wk_2026-09-28', weekStart: '2026-09-28',
//     week: horario semanal (el mismo formato que el habitual) o null si no estaba declarada,
//     dismissed: true si se eligió el horario habitual, createdAt, updatedAt }

export const STORAGE_KEY = 'cesi_weekly_availability_v1'

export function getAllWeeklyAvailability() {
  const list = readJSON(STORAGE_KEY, [])
  return Array.isArray(list) ? list.filter((d) => d && d.id && d.weekStart) : []
}

export function saveWeeklyAvailability(weeks) {
  writeJSON(STORAGE_KEY, weeks)
}

// Última semana declarada (la de lunes más reciente): { key, week } o null.
export function latestDeclaredWeek(weeks = []) {
  const declared = weeks.filter((d) => Array.isArray(d.week)).sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1))[0]
  return declared ? { key: declared.weekStart, week: normalizeWeek(declared.week) } : null
}

const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function shortDate(date) {
  return `${date.getDate()} ${SHORT_MONTHS[date.getMonth()]}`
}

// "28 sep – 4 oct"
export function weekRangeLabel(key) {
  const start = parseISO(key)
  return `${shortDate(start)} – ${shortDate(addDays(start, 6))}`
}

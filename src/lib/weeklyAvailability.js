import { addDays, addWeeks, format, parseISO, startOfWeek } from 'date-fns'
import { readJSON, writeJSON } from './store'
import { normalizeWeek, slotIntervalsOn } from './weeklySchedule'

// Disponibilidad declarada semana a semana (lunes a domingo). Si una semana está declarada,
// sustituye al horario habitual esos 7 días; si no, se usa el habitual.
//
// Documento (cesi_weekly_availability_v1), uno por semana, con id = 'wk_' + lunes:
//   { id: 'wk_2026-09-28', weekStart: '2026-09-28',
//     week: horario semanal (el mismo formato que el habitual) o null si no está declarada,
//     dismissed: true si elegí quedarme con el horario habitual (no se vuelve a avisar),
//     createdAt, updatedAt }
// El id fijo por semana evita duplicados si se declara la misma semana en dos dispositivos.

export const STORAGE_KEY = 'cesi_weekly_availability_v1'

const WEEK_OPTS = { weekStartsOn: 1 }

// 'AAAA-MM-DD' del lunes de la semana de `date`.
export function weekKeyOf(date) {
  return format(startOfWeek(date, WEEK_OPTS), 'yyyy-MM-dd')
}

export function weekStartFromKey(key) {
  return parseISO(key)
}

export function weekDocId(key) {
  return `wk_${key}`
}

export function getAllWeeklyAvailability() {
  const list = readJSON(STORAGE_KEY, [])
  return Array.isArray(list) ? list.filter((d) => d && d.id && d.weekStart) : []
}

function docFor(key, weeks) {
  return weeks.find((d) => d.weekStart === key) || null
}

// Horario declarado para la semana de `date` o null si esa semana usa el habitual.
export function declaredWeekFor(date, weeks = []) {
  const doc = docFor(weekKeyOf(date), weeks)
  return doc && Array.isArray(doc.week) ? normalizeWeek(doc.week) : null
}

export function isWeekDeclared(key, weeks = []) {
  const doc = docFor(key, weeks)
  return !!doc && Array.isArray(doc.week)
}

// Horario que vale para el día `date`: el declarado de su semana o el habitual.
export function scheduleFor(date, workingHours, weeks = []) {
  return declaredWeekFor(date, weeks) || workingHours
}

// Franjas del día `date` como intervalos de Date, según la semana a la que pertenece.
export function scheduleIntervalsOn(date, workingHours, weeks = []) {
  return slotIntervalsOn(scheduleFor(date, workingHours, weeks), date)
}

// "Copiar la semana anterior": lo que valió la semana anterior (declarada o, si no, el habitual).
export function previousWeekSchedule(key, workingHours, weeks = []) {
  return scheduleFor(addWeeks(weekStartFromKey(key), -1), workingHours, weeks)
}

// ---------------------------------------------------------------------------
// Cambios (devuelven la lista nueva; la guarda saveWeeklyAvailability)
// ---------------------------------------------------------------------------

function upsert(weeks, key, patch, now = new Date()) {
  const stamp = now.toISOString()
  const existing = docFor(key, weeks)
  if (existing) return weeks.map((d) => (d === existing ? { ...d, ...patch, updatedAt: stamp } : d))
  return [...weeks, { id: weekDocId(key), weekStart: key, week: null, dismissed: false, ...patch, createdAt: stamp, updatedAt: stamp }]
}

export function declareWeek(weeks, key, week, now) {
  return upsert(weeks, key, { week, dismissed: false }, now)
}

// "Volver al horario habitual" y "Usar mi horario habitual": borra la declaración de esa
// semana y deja de avisar por ella.
export function revertToHabitual(weeks, key, now) {
  return upsert(weeks, key, { week: null, dismissed: true }, now)
}

export function saveWeeklyAvailability(weeks) {
  writeJSON(STORAGE_KEY, weeks)
}

// ---------------------------------------------------------------------------
// Aviso de la barra lateral
// ---------------------------------------------------------------------------

/**
 * Semana por la que hay que avisar, o null:
 * - el domingo, la semana que viene si no está declarada;
 * - de lunes a sábado, la semana en curso si sigue sin declarar.
 * No se avisa por una semana descartada ("Usar mi horario habitual").
 * Devuelve { key, weekStart, next } (next = true si es la semana que viene).
 */
export function pendingDeclaration(now, weeks = []) {
  const next = now.getDay() === 0
  const weekStart = next ? addDays(startOfWeek(now, WEEK_OPTS), 7) : startOfWeek(now, WEEK_OPTS)
  const key = format(weekStart, 'yyyy-MM-dd')
  const doc = docFor(key, weeks)
  if (doc && (Array.isArray(doc.week) || doc.dismissed)) return null
  return { key, weekStart, next }
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// "28 sep"
function shortDate(date) {
  return `${date.getDate()} ${SHORT_MONTHS[date.getMonth()]}`
}

// "28 sep – 4 oct"
export function weekRangeLabel(key) {
  const start = weekStartFromKey(key)
  return `${shortDate(start)} – ${shortDate(addDays(start, 6))}`
}

// "la semana del 28 sep"
export function weekOfLabel(key) {
  return `la semana del ${shortDate(weekStartFromKey(key))}`
}

// Texto de ayuda de Buscar hueco sobre qué horario se usa entre fromDate y toDate.
export function scheduleSourceText(fromDate, toDate, weeks = []) {
  const keys = []
  for (let d = startOfWeek(fromDate, WEEK_OPTS); d <= toDate; d = addWeeks(d, 1)) keys.push(format(d, 'yyyy-MM-dd'))
  const declared = keys.filter((k) => isWeekDeclared(k, weeks))
  if (declared.length === 0) return null
  const list = declared.map(weekOfLabel)
  const joined = list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`
  return declared.length === keys.length
    ? `Usando tu disponibilidad de ${joined}.`
    : `Usando tu disponibilidad de ${joined} y tu horario habitual el resto de días.`
}

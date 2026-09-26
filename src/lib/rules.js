import { createCollection } from './store'
import { eventHasTag, sameTag } from './tags'
import { timeToMinutes } from './weeklySchedule'
import { isExcluded } from './conflicts'

// Reglas por tipo de reunión. Cada regla se aplica a una categoría o a una etiqueta:
// {
//   id, enabled,
//   targetType: 'category' | 'tag', target: 'Cliente' | 'entrevista',
//   days: [0..6]              días permitidos (como Date#getDay; los 7 = cualquier día)
//   timeOfDay: 'any' | 'morning' | 'afternoon' | 'custom', customStart, customEnd ('HH:mm')
//   maxDurationMinutes: número | null
//   maxPerDay: número | null
// }

export const STORAGE_KEY = 'cesi_rules_v1'

export const rulesStore = createCollection(STORAGE_KEY, { prefix: 'rule' })

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
// Mañana hasta las 14:00 y tarde desde las 14:00, siempre dentro de mi horario habitual.
export const MIDDAY = '14:00'

export const TIME_OF_DAY_LABELS = {
  any: 'Cualquier momento',
  morning: 'Solo por la mañana (antes de las 14:00)',
  afternoon: 'Solo por la tarde (desde las 14:00)',
  custom: 'Franja personalizada',
}

const DAY_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const DAY_PLURAL = ['los domingos', 'los lunes', 'los martes', 'los miércoles', 'los jueves', 'los viernes', 'los sábados']
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

export function newRule(partial = {}) {
  return {
    enabled: true,
    targetType: 'category',
    target: '',
    days: [...ALL_DAYS],
    timeOfDay: 'any',
    customStart: '09:00',
    customEnd: '14:00',
    maxDurationMinutes: null,
    maxPerDay: null,
    ...partial,
  }
}

export function getAllRules() {
  return rulesStore.getAll()
}

// ---------------------------------------------------------------------------
// Tipo de reunión: { category, tags } de una reunión o elegido en "Buscar hueco".
// ---------------------------------------------------------------------------

export function ruleAppliesTo(rule, type) {
  if (!rule.enabled || !rule.target || !type) return false
  if (rule.targetType === 'category') return type.category === rule.target
  return (type.tags || []).some((t) => sameTag(t, rule.target))
}

export function rulesForType(rules, type) {
  return rules.filter((r) => ruleAppliesTo(r, type))
}

function eventMatchesRuleTarget(event, rule) {
  if (event.isUnavailable) return false
  if (rule.targetType === 'category') return event.category === rule.target
  return eventHasTag(event, rule.target)
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

export function ruleTargetLabel(rule) {
  return rule.targetType === 'category' ? `«${rule.target}»` : `con la etiqueta «${rule.target}»`
}

function subject(rule) {
  return `Las reuniones ${ruleTargetLabel(rule)}`
}

export function formatMinutes(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return h === 1 ? '1 hora' : `${h} horas`
  return `${h} h ${m} min`
}

function daysText(days) {
  const ordered = DISPLAY_ORDER.filter((d) => days.includes(d))
  if (ordered.length === 7) return null
  if (ordered.length === 5 && [1, 2, 3, 4, 5].every((d) => ordered.includes(d))) return 'de lunes a viernes'
  const parts = ordered.map((d) => DAY_PLURAL[d])
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}` : parts[0]
}

function timeOfDayText(rule) {
  if (rule.timeOfDay === 'morning') return 'por la mañana'
  if (rule.timeOfDay === 'afternoon') return 'por la tarde'
  if (rule.timeOfDay === 'custom') return `entre las ${rule.customStart} y las ${rule.customEnd}`
  return null
}

// Resumen corto para la lista de reglas: "lun, mar, mié · por la mañana · máx. 1 hora · máx. 2 al día"
export function describeRule(rule) {
  const parts = []
  const days = DISPLAY_ORDER.filter((d) => rule.days.includes(d))
  if (days.length < 7) parts.push(days.length === 0 ? 'ningún día' : days.map((d) => DAY_SHORT[d]).join(', '))
  const tod = timeOfDayText(rule)
  if (tod) parts.push(tod)
  if (rule.maxDurationMinutes) parts.push(`máx. ${formatMinutes(rule.maxDurationMinutes)}`)
  if (rule.maxPerDay) parts.push(`máx. ${rule.maxPerDay} al día`)
  return parts.length ? parts.join(' · ') : 'Sin restricciones'
}

export function validateRule(rule) {
  if (!rule.target || !rule.target.trim()) return 'Elige la categoría o etiqueta a la que se aplica la regla.'
  if (rule.days.length === 0) return 'Marca al menos un día permitido.'
  if (rule.timeOfDay === 'custom' && timeToMinutes(rule.customEnd) <= timeToMinutes(rule.customStart)) {
    return 'La franja personalizada debe terminar después de empezar.'
  }
  if (rule.maxDurationMinutes !== null && !(rule.maxDurationMinutes > 0)) return 'La duración máxima no es válida.'
  if (rule.maxPerDay !== null && !(rule.maxPerDay >= 1)) return 'El máximo por día debe ser 1 o más.'
  return null
}

// ---------------------------------------------------------------------------
// Ventanas y comprobaciones
// ---------------------------------------------------------------------------

function atMinutes(day, minutes) {
  const d = new Date(day)
  d.setHours(0, minutes, 0, 0)
  return d
}

// Franja permitida por la regla ese día (lista vacía si el día no está permitido).
export function ruleWindowsOn(rule, day) {
  if (!rule.days.includes(day.getDay())) return []
  let start = 0
  let end = 24 * 60
  if (rule.timeOfDay === 'morning') end = timeToMinutes(MIDDAY)
  else if (rule.timeOfDay === 'afternoon') start = timeToMinutes(MIDDAY)
  else if (rule.timeOfDay === 'custom') {
    start = timeToMinutes(rule.customStart)
    end = timeToMinutes(rule.customEnd)
  }
  return [{ start: atMinutes(day, start), end: atMinutes(day, end) }]
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

// Reuniones de ese tipo que ya hay en el día (ocurrencias expandidas), sin contar la que se está
// editando (`exclude`: su serie, excludeSeriesId, o solo esa ocurrencia, excludeId; ver conflicts.js).
export function countOfTypeOnDay(rule, occurrences, day, exclude = {}) {
  const options = typeof exclude === 'string' ? { excludeSeriesId: exclude } : exclude || {}
  return occurrences.filter(
    (ev) => !isExcluded(ev, options) && sameDay(ev.start, day) && eventMatchesRuleTarget(ev, rule),
  ).length
}

/**
 * Motivos por los que una reunión incumple las reglas activas de su tipo.
 * `meeting` = { start, end, category, tags, isUnavailable }; `occurrences` = reuniones expandidas
 * de ese día. Devuelve [{ rule, message }] (vacío si cumple todas).
 */
export function checkMeetingAgainstRules(meeting, rules, occurrences, exclude = {}) {
  if (meeting.isUnavailable || meeting.allDay) return []
  const start = new Date(meeting.start)
  const end = new Date(meeting.end)
  const violations = []

  for (const rule of rulesForType(rules, meeting)) {
    if (!rule.days.includes(start.getDay())) {
      violations.push({ rule, message: `${subject(rule)} son solo ${daysText(rule.days)}.` })
      continue
    }
    const [window] = ruleWindowsOn(rule, start)
    if (rule.timeOfDay !== 'any' && (start < window.start || end > window.end)) {
      violations.push({ rule, message: `${subject(rule)} son solo ${timeOfDayText(rule)}.` })
    }
    const minutes = Math.round((end - start) / 60000)
    if (rule.maxDurationMinutes && minutes > rule.maxDurationMinutes) {
      violations.push({ rule, message: `${subject(rule)} duran como máximo ${formatMinutes(rule.maxDurationMinutes)}.` })
    }
    if (rule.maxPerDay && countOfTypeOnDay(rule, occurrences, start, exclude) + 1 > rule.maxPerDay) {
      const n = rule.maxPerDay
      violations.push({ rule, message: `Ya tienes ${n} ${n === 1 ? 'reunión' : 'reuniones'} ${ruleTargetLabel(rule)} ese día (máximo ${n}).` })
    }
  }
  return violations
}

// Error que usa el formulario para mostrar el aviso con "Guardar igualmente".
export class RuleWarning extends Error {
  constructor(violations) {
    super(violations.map((v) => v.message).join(' '))
    this.violations = violations
  }
}

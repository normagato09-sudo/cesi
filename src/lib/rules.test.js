import { describe, expect, it } from 'vitest'
import { findSlots } from './findSlots'
import { checkMeetingAgainstRules, describeRule, newRule, validateRule } from './rules'
import { expandEvents } from './recurrence'
import { emptyWeek } from './weeklySchedule'

const MON = new Date(2026, 8, 21) // lunes 21/09/2026
const NOW = new Date(2026, 8, 20, 12, 0)

function at(day, h, m = 0) {
  const d = new Date(day)
  d.setHours(h, m, 0, 0)
  return d
}

function addDaysTo(day, n) {
  const d = new Date(day)
  d.setDate(d.getDate() + n)
  return d
}

const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const dayAndTime = (s) => `${s.start.getDate()} ${hhmm(s.start)}`

// Lunes a viernes, 09:00–14:00 y 16:00–19:00.
const WORK = emptyWeek().map((e) =>
  e.day >= 1 && e.day <= 5
    ? { ...e, enabled: true, slots: [{ start: '09:00', end: '14:00' }, { start: '16:00', end: '19:00' }] }
    : e,
)

const interview = (partial) => newRule({ targetType: 'tag', target: 'entrevista', ...partial })
const TYPE = { category: 'Reunión', tags: ['Entrevista'] }

function meeting(id, day, startH, endH, extra = {}) {
  return {
    id,
    title: id,
    start: at(day, startH).toISOString(),
    end: at(day, endH).toISOString(),
    category: 'Reunión',
    tags: [],
    recurrence: null,
    ...extra,
  }
}

const base = {
  durationMinutes: 60,
  fromDate: MON,
  toDate: addDaysTo(MON, 4),
  events: [],
  workingHours: WORK,
  now: NOW,
  meetingType: TYPE,
}

describe('findSlots con reglas', () => {
  it('sin tipo de reunión no aplica reglas', () => {
    const slots = findSlots({ ...base, rules: [interview({ days: [3] })], meetingType: null })
    expect(slots.length).toBe(10)
    expect(slots[0].rules).toEqual([])
  })

  it('solo propone días permitidos', () => {
    const rule = interview({ days: [2, 4] }) // martes y jueves
    const slots = findSlots({ ...base, rules: [rule] })
    expect([...new Set(slots.map((s) => s.start.getDay()))]).toEqual([2, 4])
    expect(slots.every((s) => s.rules[0] === rule)).toBe(true)
  })

  it('respeta la franja de la regla dentro del horario (mañana, tarde, personalizada)', () => {
    const morning = findSlots({ ...base, toDate: MON, rules: [interview({ timeOfDay: 'morning' })] })
    expect(morning.map((s) => hhmm(s.start))).toEqual(['09:00'])
    const afternoon = findSlots({ ...base, toDate: MON, rules: [interview({ timeOfDay: 'afternoon' })] })
    expect(afternoon.map((s) => hhmm(s.start))).toEqual(['16:00'])
    const custom = findSlots({
      ...base,
      toDate: MON,
      rules: [interview({ timeOfDay: 'custom', customStart: '12:30', customEnd: '17:30' })],
    })
    // 12:30–14:00 (horario) y 16:00–17:30 (horario ∩ franja).
    expect(custom.map((s) => hhmm(s.start))).toEqual(['12:30', '16:00'])
  })

  it('no propone nada si la duración supera la máxima', () => {
    expect(findSlots({ ...base, durationMinutes: 90, rules: [interview({ maxDurationMinutes: 60 })] })).toEqual([])
    expect(findSlots({ ...base, durationMinutes: 45, rules: [interview({ maxDurationMinutes: 60 })] }).length).toBe(10)
  })

  it('respeta el máximo de reuniones de ese tipo por día', () => {
    const rule = interview({ maxPerDay: 1 })
    const events = [meeting('ya', MON, 9, 10, { tags: ['entrevista'] })]
    const slots = findSlots({ ...base, toDate: addDaysTo(MON, 1), rules: [rule], events })
    // El lunes ya tiene una entrevista; el martes solo se propone una.
    expect(slots.map(dayAndTime)).toEqual(['22 09:00'])
  })

  it('ignora reglas desactivadas o de otro tipo', () => {
    const off = interview({ days: [3], enabled: false })
    const other = newRule({ targetType: 'category', target: 'Cliente', days: [3] })
    expect(findSlots({ ...base, rules: [off, other] }).length).toBe(10)
  })
})

describe('aviso al guardar a mano', () => {
  const occurrencesOn = (events) => expandEvents(events, MON, addDaysTo(MON, 7))

  it('explica el motivo de cada regla incumplida', () => {
    const rule = interview({ timeOfDay: 'morning', maxDurationMinutes: 60, days: [1, 2, 3, 4, 5] })
    const m = { start: at(MON, 16), end: at(MON, 17, 30), category: 'Reunión', tags: ['entrevista'] }
    expect(checkMeetingAgainstRules(m, [rule], []).map((v) => v.message)).toEqual([
      'Las reuniones con la etiqueta «entrevista» son solo por la mañana.',
      'Las reuniones con la etiqueta «entrevista» duran como máximo 1 hora.',
    ])
  })

  it('avisa de días no permitidos y del máximo por día, sin contarse a sí misma', () => {
    const rule = newRule({ targetType: 'category', target: 'Cliente', days: [2, 4], maxPerDay: 1 })
    const sat = addDaysTo(MON, 5)
    expect(checkMeetingAgainstRules({ start: at(sat, 10), end: at(sat, 11), category: 'Cliente' }, [rule], [])[0].message).toBe(
      'Las reuniones «Cliente» son solo los martes y los jueves.',
    )
    const tue = addDaysTo(MON, 1)
    const existing = [meeting('c1', tue, 9, 10, { category: 'Cliente' })]
    const occ = occurrencesOn(existing)
    expect(checkMeetingAgainstRules({ start: at(tue, 12), end: at(tue, 13), category: 'Cliente' }, [rule], occ)[0].message).toBe(
      'Ya tienes 1 reunión «Cliente» ese día (máximo 1).',
    )
    // Editando la misma reunión no cuenta como otra.
    expect(checkMeetingAgainstRules({ start: at(tue, 12), end: at(tue, 13), category: 'Cliente' }, [rule], occ, { excludeSeriesId: 'c1' })).toEqual([])
  })

  it('describe y valida reglas', () => {
    expect(describeRule(interview({ days: [1, 2], timeOfDay: 'morning', maxDurationMinutes: 90, maxPerDay: 2 }))).toBe(
      'lun, mar · por la mañana · máx. 1 h 30 min · máx. 2 al día',
    )
    expect(validateRule(newRule())).toMatch(/categoría o etiqueta/)
    expect(validateRule(interview({ days: [] }))).toMatch(/al menos un día/)
    expect(validateRule(interview({ timeOfDay: 'custom', customStart: '15:00', customEnd: '10:00' }))).toMatch(/terminar después/)
  })
})

import { describe, expect, it } from 'vitest'
import { expandEvent, expandEvents } from './recurrence'
import {
  cancelOccurrencePatch,
  editOccurrencePatch,
  editSeriesPatch,
  restoreOccurrencePatch,
  splitSeries,
  truncateSeriesPatch,
} from './seriesEdits'
import { notesOf, notesPatch } from './notes'
import { findSlots } from './findSlots'
import { computeSummary } from './summary'
import { computeWeeklyReport } from './weeklyReport'
import { findConflict } from './conflicts'
import { contactOccurrences, contactSeries } from './contacts'

// Serie semanal: los martes de 10:00 a 11:00 desde el 1 de septiembre de 2026 hasta el 27 de octubre.
const d = (month, day, hh = 0, mm = 0) => new Date(2026, month - 1, day, hh, mm)
const series = {
  id: 's1',
  title: 'Seguimiento',
  category: 'Reunión',
  tags: [],
  participantIds: ['ana'],
  guests: [],
  participants: ['Ana'],
  projectId: null,
  description: '',
  meetLink: '',
  isUnavailable: false,
  allDay: false,
  start: d(9, 1, 10).toISOString(),
  end: d(9, 1, 11).toISOString(),
  recurrence: { freq: 'weekly', until: d(10, 27, 23, 59).toISOString() },
}

const all = (ev) => expandEvent(ev, d(8, 1), d(12, 1))
const occurrenceOn = (ev, month, day) => all(ev).find((o) => o.originalStart.getMonth() === month - 1 && o.originalStart.getDate() === day)
const apply = (ev, patch) => ({ ...ev, ...patch })
const days = (list) => list.map((o) => `${o.start.getDate()}/${o.start.getMonth() + 1}`)

describe('reuniones que se repiten: solo este día', () => {
  it('cambia la hora y el título de un solo día; el resto de la serie no cambia', () => {
    const occ = occurrenceOn(series, 9, 15)
    const patch = editOccurrencePatch(series, occ, { ...occ, title: 'Seguimiento (largo)', start: d(9, 15, 12), end: d(9, 15, 14) })
    expect(patch.exceptions).toEqual({
      '2026-09-15': { title: 'Seguimiento (largo)', start: d(9, 15, 12).toISOString(), end: d(9, 15, 14).toISOString() },
    })
    const edited = apply(series, patch)
    const out = all(edited)
    expect(out).toHaveLength(9)
    const changed = out.find((o) => o.id === occ.id)
    expect(changed).toMatchObject({ title: 'Seguimiento (largo)', isException: true, seriesId: 's1' })
    expect(changed.start).toEqual(d(9, 15, 12))
    expect(changed.end).toEqual(d(9, 15, 14))
    const other = occurrenceOn(edited, 9, 22)
    expect(other.title).toBe('Seguimiento')
    expect(other.start).toEqual(d(9, 22, 10))
    expect(other.isException).toBeUndefined()
  })

  it('cambia los participantes y el proyecto solo ese día', () => {
    const occ = occurrenceOn(series, 9, 8)
    const edited = apply(series, editOccurrencePatch(series, occ, { participantIds: ['ana', 'luis'], participants: ['Ana', 'Luis'], guests: [], projectId: 'radio' }))
    expect(edited.exceptions['2026-09-08']).toEqual({ participantIds: ['ana', 'luis'], participants: ['Ana', 'Luis'], projectId: 'radio' })
    expect(occurrenceOn(edited, 9, 8).participantIds).toEqual(['ana', 'luis'])
    expect(occurrenceOn(edited, 9, 15).participantIds).toEqual(['ana'])
    // En la ficha de Luis sale solo ese día.
    const luis = { id: 'luis', name: 'Luis' }
    expect(contactSeries(luis, [edited], [])).toHaveLength(1)
    expect(days(contactOccurrences(luis, all(edited), []))).toEqual(['8/9'])
  })

  it('si al final queda igual que la serie, no se guarda excepción', () => {
    const occ = occurrenceOn(series, 9, 15)
    const moved = apply(series, editOccurrencePatch(series, occ, { start: d(9, 15, 12), end: d(9, 15, 13) }))
    const back = editOccurrencePatch(moved, occurrenceOn(moved, 9, 15), { start: d(9, 15, 10), end: d(9, 15, 11) })
    expect(back.exceptions).toEqual({})
  })

  it('cancela un solo día: no aparece en el calendario y los demás sí', () => {
    const occ = occurrenceOn(series, 9, 22)
    const edited = apply(series, cancelOccurrencePatch(series, occ))
    expect(edited.exceptions).toEqual({ '2026-09-22': { cancelled: true } })
    expect(days(all(edited))).not.toContain('22/9')
    expect(days(all(edited))).toContain('29/9')
    expect(all(edited)).toHaveLength(8)
  })

  it('"Volver a como era en la serie" quita la excepción', () => {
    const occ = occurrenceOn(series, 9, 15)
    const edited = apply(series, editOccurrencePatch(series, occ, { title: 'Otro' }))
    const restored = apply(edited, restoreOccurrencePatch(edited, occurrenceOn(edited, 9, 15)))
    expect(restored.exceptions).toEqual({})
    expect(occurrenceOn(restored, 9, 15).title).toBe('Seguimiento')
  })

  it('las notas de un día movido siguen siendo de ese día', () => {
    const withNotes = { ...series, notesByDate: { '2026-09-15': 'Presupuesto enviado' } }
    const occ = occurrenceOn(withNotes, 9, 15)
    const moved = apply(withNotes, editOccurrencePatch(withNotes, occ, { start: d(9, 16, 10), end: d(9, 16, 11) }))
    const movedOcc = occurrenceOn(moved, 9, 15)
    expect(movedOcc.start).toEqual(d(9, 16, 10))
    expect(notesOf(movedOcc)).toBe('Presupuesto enviado')
    expect(notesPatch(moved, movedOcc, 'Nuevo').notesByDate).toEqual({ '2026-09-15': 'Nuevo' })
  })

  it('un día movido fuera del rango visible no aparece y uno movido dentro sí', () => {
    const occ = occurrenceOn(series, 9, 15)
    const moved = apply(series, editOccurrencePatch(series, occ, { start: d(9, 17, 10), end: d(9, 17, 11) }))
    expect(expandEvent(moved, d(9, 15), d(9, 16))).toHaveLength(0)
    expect(days(expandEvent(moved, d(9, 17), d(9, 18)))).toEqual(['17/9'])
  })
})

describe('reuniones que se repiten: este y los siguientes', () => {
  const withNotes = {
    ...series,
    notesByDate: { '2026-09-08': 'Nota del 8', '2026-09-15': 'Nota del 15', '2026-09-22': 'Nota del 22' },
    exceptions: { '2026-09-01': { title: 'Primera' }, '2026-09-29': { cancelled: true } },
  }

  it('la serie termina el día anterior y la nueva lleva los cambios y las notas de sus días', () => {
    const occ = occurrenceOn(withNotes, 9, 15)
    const { seriesPatch, newEvent } = splitSeries(withNotes, occ, { title: 'Seguimiento nuevo', start: d(9, 15, 16), end: d(9, 15, 17) })

    const before = apply(withNotes, seriesPatch)
    expect(days(all(before))).toEqual(['1/9', '8/9'])
    expect(before.notesByDate).toEqual({ '2026-09-08': 'Nota del 8' })
    expect(before.exceptions).toEqual({ '2026-09-01': { title: 'Primera' } })

    const after = { ...newEvent, id: 's2' }
    expect(after.title).toBe('Seguimiento nuevo')
    expect(after.notesByDate).toEqual({ '2026-09-15': 'Nota del 15', '2026-09-22': 'Nota del 22' })
    expect(after.recurrence).toEqual(withNotes.recurrence)
    const occurrences = all(after)
    // El 29 sigue cancelado en la serie nueva.
    expect(days(occurrences)).toEqual(['15/9', '22/9', '6/10', '13/10', '20/10', '27/10'])
    expect(occurrences[0].start).toEqual(d(9, 15, 16))
    expect(notesOf(occurrences[1])).toBe('Nota del 22')
    // Entre las dos no se pierde ni se repite ningún día.
    expect(all(before).length + occurrences.length).toBe(all(withNotes).length)
  })

  it('si la serie pasa a otro día de la semana, las notas se mueven con sus días', () => {
    const occ = occurrenceOn(withNotes, 9, 15)
    const { newEvent } = splitSeries(withNotes, occ, { start: d(9, 16, 10), end: d(9, 16, 11) })
    expect(newEvent.notesByDate).toEqual({ '2026-09-16': 'Nota del 15', '2026-09-23': 'Nota del 22' })
    expect(notesOf(all(newEvent)[0])).toBe('Nota del 15')
  })

  it('en el primer día es lo mismo que toda la serie', () => {
    expect(splitSeries(withNotes, occurrenceOn(withNotes, 9, 1), { title: 'x' })).toBeNull()
    expect(truncateSeriesPatch(withNotes, occurrenceOn(withNotes, 9, 1))).toBeNull()
  })

  it('borrar este y los siguientes deja solo los días anteriores', () => {
    const edited = apply(withNotes, truncateSeriesPatch(withNotes, occurrenceOn(withNotes, 9, 22)))
    expect(days(all(edited))).toEqual(['1/9', '8/9', '15/9'])
    expect(edited.notesByDate).toEqual({ '2026-09-08': 'Nota del 8', '2026-09-15': 'Nota del 15' })
  })
})

describe('reuniones que se repiten: toda la serie', () => {
  it('cambiar la hora desde un día cualquiera cambia la hora de todos sin perder los días anteriores', () => {
    const occ = occurrenceOn(series, 9, 22)
    const edited = apply(series, editSeriesPatch(series, occ, { title: 'Nuevo', start: d(9, 22, 9, 30), end: d(9, 22, 10, 30) }))
    const out = all(edited)
    expect(out).toHaveLength(9)
    expect(out[0].start).toEqual(d(9, 1, 9, 30))
    expect(out.every((o) => o.title === 'Nuevo' && o.start.getHours() === 9 && o.start.getMinutes() === 30)).toBe(true)
  })

  it('si solo cambia el título, la hora de la serie no cambia', () => {
    const occ = occurrenceOn(series, 9, 22)
    const patch = editSeriesPatch(series, occ, { title: 'Nuevo', start: occ.start, end: occ.end })
    expect(patch.start).toBe(series.start)
    expect(patch.end).toBe(series.end)
  })
})

describe('las excepciones se respetan en todas partes', () => {
  const WORKDAYS = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day,
    enabled: day >= 1 && day <= 5,
    slots: [{ start: '09:00', end: '13:00' }],
  }))
  // Semana del 21 al 27 de septiembre: el martes 22 se cancela y el martes 29 se mueve a las 12:00.
  const occ22 = occurrenceOn(series, 9, 22)
  const occ29 = occurrenceOn(series, 9, 29)
  let edited = apply(series, cancelOccurrencePatch(series, occ22))
  edited = apply(edited, editOccurrencePatch(edited, occ29, { start: d(9, 29, 12), end: d(9, 29, 13) }))

  // Huecos de `minutes` minutos ese día (horario de 09:00 a 13:00).
  const slotsOn = (events, day, minutes) =>
    findSlots({ durationMinutes: minutes, fromDate: day, toDate: day, now: d(9, 1), events, workingHours: WORKDAYS }).map(
      (s) => `${s.start.getHours()}:${String(s.start.getMinutes()).padStart(2, '0')}`,
    )

  it('Buscar hueco no ve el día cancelado y usa la hora propia del día cambiado', () => {
    // Martes 22: la serie lo ocupa de 10 a 11; cancelado, la mañana queda libre.
    expect(slotsOn([series], d(9, 22), 240)).toEqual([])
    expect(slotsOn([edited], d(9, 22), 240)).toEqual(['9:00'])
    // Martes 29: movido a las 12:00, queda libre de 9 a 12 y ocupado de 12 a 13.
    expect(slotsOn([series], d(9, 29), 180)).toEqual([])
    expect(slotsOn([edited], d(9, 29), 180)).toEqual(['9:00'])
    expect(slotsOn([edited], d(9, 29), 240)).toEqual([])
  })

  it('el resumen de hoy y el semanal no cuentan el día cancelado', () => {
    expect(computeSummary([series], WORKDAYS, d(9, 22, 8)).today.meetings).toBe(1)
    const summary = computeSummary([edited], WORKDAYS, d(9, 22, 8))
    expect(summary.today.meetings).toBe(0)
    expect(summary.week.meetings).toBe(0)
    expect(summary.nextMeeting.start).toEqual(d(9, 29, 12))

    expect(computeWeeklyReport([series], { weekStart: d(9, 21), workingHours: WORKDAYS }).count).toBe(1)
    expect(computeWeeklyReport([edited], { weekStart: d(9, 21), workingHours: WORKDAYS }).count).toBe(0)
    const next = computeWeeklyReport([edited], { weekStart: d(9, 28), workingHours: WORKDAYS })
    expect(next.count).toBe(1)
    expect(next.meetings[0].start).toEqual(d(9, 29, 12))
  })

  it('los solapes usan la hora propia del día y, al cambiar solo ese día, se ignora solo a sí mismo', () => {
    const occurrences = expandEvents([edited], d(9, 29), d(9, 30))
    expect(findConflict(occurrences, d(9, 29, 10), d(9, 29, 11))).toBeNull()
    expect(findConflict(occurrences, d(9, 29, 12), d(9, 29, 12, 30))).not.toBeNull()
    expect(findConflict(occurrences, d(9, 29, 12), d(9, 29, 12, 30), { excludeId: occ29.id })).toBeNull()
  })
})

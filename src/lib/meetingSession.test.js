import { describe, expect, it } from 'vitest'
import { expandEvents } from './recurrence'
import {
  isEmptySession,
  moveItem,
  newAgendaItem,
  pastSessions,
  sessionOf,
  sessionPatch,
  toSeriesSessionPatch,
  toSingleSessionPatch,
} from './meetingSession'
import { hasNotes, notesOf } from './notes'
import { editSeriesPatch, splitSeries, truncateSeriesPatch } from './seriesEdits'

const d = (day, hh, mm = 0) => new Date(2026, 8, day, hh, mm)

const weekly = {
  id: 'w',
  title: 'Seguimiento',
  start: d(1, 10).toISOString(),
  end: d(1, 11).toISOString(),
  recurrence: { freq: 'weekly', until: d(30, 0).toISOString() },
}

const single = { id: 's', title: 'Kickoff', start: d(3, 9).toISOString(), end: d(3, 10).toISOString(), recurrence: null }

function occurrenceOn(series, day) {
  return expandEvents([series], d(day, 0), d(day + 1, 0))[0]
}

const item = (id, text, done = false) => ({ id, text, done })

describe('agenda y acta de una reunión única', () => {
  it('se guardan en la propia reunión', () => {
    const occ = occurrenceOn(single, 3)
    const patch = sessionPatch(single, occ, { agenda: [item('a', 'Presupuesto')], decisions: [{ id: 'x', text: 'Sí' }] })
    expect(patch).toEqual({ agenda: [item('a', 'Presupuesto')], decisions: [{ id: 'x', text: 'Sí' }] })
    const saved = { ...single, ...patch, notes: 'Bien' }
    expect(sessionOf(occurrenceOn(saved, 3))).toEqual({
      notes: 'Bien',
      agenda: [item('a', 'Presupuesto')],
      decisions: [{ id: 'x', text: 'Sí' }],
    })
  })

  it('una reunión sin agenda ni acta da una sesión vacía', () => {
    const session = sessionOf(occurrenceOn(single, 3))
    expect(session).toEqual({ notes: '', agenda: [], decisions: [] })
    expect(isEmptySession(session)).toBe(true)
  })
})

describe('agenda y acta por sesión en reuniones que se repiten', () => {
  it('cada día tiene la suya y las notas de siempre son el texto del acta', () => {
    const series = { ...weekly, notesByDate: { '2026-09-01': 'Nota antigua' } }
    const second = occurrenceOn(series, 8)
    const saved = { ...series, ...sessionPatch(series, second, { agenda: [item('a', 'Revisar plazos')] }) }
    expect(saved.agendaByDate).toEqual({ '2026-09-08': [item('a', 'Revisar plazos')] })
    expect(saved.notesByDate).toEqual({ '2026-09-01': 'Nota antigua' })
    expect(sessionOf(occurrenceOn(saved, 1))).toEqual({ notes: 'Nota antigua', agenda: [], decisions: [] })
    expect(sessionOf(occurrenceOn(saved, 8)).agenda).toEqual([item('a', 'Revisar plazos')])
    expect(sessionOf(occurrenceOn(saved, 15))).toEqual({ notes: '', agenda: [], decisions: [] })
  })

  it('una sesión que queda vacía se quita del mapa', () => {
    const series = { ...weekly, decisionsByDate: { '2026-09-01': [{ id: 'x', text: 'a' }], '2026-09-08': [{ id: 'y', text: 'b' }] } }
    expect(sessionPatch(series, occurrenceOn(series, 1), { decisions: [] })).toEqual({
      decisionsByDate: { '2026-09-08': [{ id: 'y', text: 'b' }] },
    })
  })

  it('las decisiones cuentan como acta (icono y reuniones sin notas)', () => {
    const series = { ...weekly, decisionsByDate: { '2026-09-08': [{ id: 'x', text: 'Contratar' }] } }
    expect(hasNotes(occurrenceOn(series, 8))).toBe(true)
    expect(notesOf(occurrenceOn(series, 8))).toBe('')
    expect(hasNotes(occurrenceOn(series, 1))).toBe(false)
  })

  it('historial: sesiones anteriores con algo escrito, de la más reciente a la más antigua', () => {
    const series = {
      ...weekly,
      notesByDate: { '2026-09-01': 'Primera', '2026-09-22': 'Futura' },
      agendaByDate: { '2026-09-08': [item('a', 'Punto')], '2026-09-15': [] },
      decisionsByDate: { '2026-09-08': [{ id: 'x', text: 'Decidido' }] },
    }
    const sessions = pastSessions(occurrenceOn(series, 15))
    expect(sessions.map((s) => s.key)).toEqual(['2026-09-08', '2026-09-01'])
    expect(sessions[0]).toEqual({ key: '2026-09-08', notes: '', agenda: [item('a', 'Punto')], decisions: [{ id: 'x', text: 'Decidido' }] })
    expect(sessions[1].notes).toBe('Primera')
    expect(pastSessions(occurrenceOn(single, 3))).toEqual([])
  })
})

describe('cambios en la serie', () => {
  const series = {
    ...weekly,
    notesByDate: { '2026-09-01': 'n1', '2026-09-15': 'n3' },
    agendaByDate: { '2026-09-01': [item('a', 'p1')], '2026-09-15': [item('b', 'p3')] },
    decisionsByDate: { '2026-09-15': [{ id: 'x', text: 'd3' }] },
  }

  it('"este y los siguientes" reparte agenda, notas y decisiones entre las dos series', () => {
    const { seriesPatch, newEvent } = splitSeries(series, occurrenceOn(series, 8), { title: 'Nuevo' })
    expect(seriesPatch.notesByDate).toEqual({ '2026-09-01': 'n1' })
    expect(seriesPatch.agendaByDate).toEqual({ '2026-09-01': [item('a', 'p1')] })
    expect(seriesPatch.decisionsByDate).toEqual({})
    expect(newEvent.notesByDate).toEqual({ '2026-09-15': 'n3' })
    expect(newEvent.agendaByDate).toEqual({ '2026-09-15': [item('b', 'p3')] })
    expect(newEvent.decisionsByDate).toEqual({ '2026-09-15': [{ id: 'x', text: 'd3' }] })
  })

  it('mover toda la serie de día mueve también la agenda y el acta', () => {
    const occ = occurrenceOn(series, 1)
    const patch = editSeriesPatch(series, occ, { start: d(2, 10), end: d(2, 11) })
    expect(patch.notesByDate).toEqual({ '2026-09-02': 'n1', '2026-09-16': 'n3' })
    expect(patch.agendaByDate).toEqual({ '2026-09-02': [item('a', 'p1')], '2026-09-16': [item('b', 'p3')] })
    expect(patch.decisionsByDate).toEqual({ '2026-09-16': [{ id: 'x', text: 'd3' }] })
  })

  it('si deja de repetirse, queda la agenda y el acta de ese día', () => {
    const patch = editSeriesPatch(series, occurrenceOn(series, 15), { recurrence: null })
    expect(patch).toMatchObject({
      notes: 'n3',
      agenda: [item('b', 'p3')],
      decisions: [{ id: 'x', text: 'd3' }],
      notesByDate: {},
      agendaByDate: {},
      decisionsByDate: {},
    })
  })

  it('borrar "este y los siguientes" quita solo las sesiones borradas', () => {
    const patch = truncateSeriesPatch(series, occurrenceOn(series, 8))
    expect(patch.notesByDate).toEqual({ '2026-09-01': 'n1' })
    expect(patch.agendaByDate).toEqual({ '2026-09-01': [item('a', 'p1')] })
    expect(patch.decisionsByDate).toEqual({})
  })
})

describe('una reunión única que pasa a repetirse', () => {
  it('conserva sus notas, agenda y decisiones como las de su primer día', () => {
    const event = { ...single, notes: 'Notas de siempre', agenda: [item('a', 'p')], decisions: [] }
    const patch = toSeriesSessionPatch(event, single.start)
    expect(patch).toEqual({
      notesByDate: { '2026-09-03': 'Notas de siempre' },
      notes: '',
      agendaByDate: { '2026-09-03': [item('a', 'p')] },
      agenda: [],
      decisionsByDate: {},
      decisions: [],
    })
    const series = { ...event, ...patch, recurrence: { freq: 'weekly', until: d(30, 0).toISOString() } }
    expect(notesOf(occurrenceOn(series, 3))).toBe('Notas de siempre')
    expect(sessionOf(occurrenceOn(series, 3)).agenda).toEqual([item('a', 'p')])
  })

  it('sin nada escrito no añade nada', () => {
    expect(toSeriesSessionPatch(single, single.start)).toEqual({})
  })

  it('y al revés: la serie que deja de repetirse se queda con el día elegido', () => {
    const series = { ...weekly, notesByDate: { '2026-09-08': 'x' } }
    expect(toSingleSessionPatch(series, '2026-09-08')).toEqual({
      notes: 'x',
      notesByDate: {},
      agenda: [],
      agendaByDate: {},
      decisions: [],
      decisionsByDate: {},
    })
  })
})

describe('listas', () => {
  it('sube y baja puntos sin salirse de la lista', () => {
    const list = ['a', 'b', 'c']
    expect(moveItem(list, 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveItem(list, 1, 1)).toEqual(['a', 'c', 'b'])
    expect(moveItem(list, 0, -1)).toBe(list)
    expect(moveItem(list, 2, 1)).toBe(list)
  })

  it('un punto nuevo empieza sin tachar y con id', () => {
    const it1 = newAgendaItem('Hola')
    expect(it1).toMatchObject({ text: 'Hola', done: false })
    expect(it1.id).toBeTruthy()
  })
})

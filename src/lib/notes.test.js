import { describe, expect, it } from 'vitest'
import { expandEvents } from './recurrence'
import { hasNotes, meetingsMissingNotes, notesOf, notesPatch, notesPreview } from './notes'

const d = (day, hh, mm = 0) => new Date(2026, 8, day, hh, mm)

const weekly = {
  id: 'w',
  title: 'Seguimiento',
  start: d(1, 10).toISOString(),
  end: d(1, 11).toISOString(),
  recurrence: { freq: 'weekly', until: d(30, 0).toISOString() },
}

function occurrencesOf(series, day) {
  return expandEvents([series], d(day, 0), d(day + 1, 0))[0]
}

describe('notas por día en reuniones que se repiten (notesByDate)', () => {
  it('guarda cada día por separado', () => {
    const first = occurrencesOf(weekly, 1)
    const second = occurrencesOf(weekly, 8)
    let series = { ...weekly, ...notesPatch(weekly, first, 'Presupuesto aprobado') }
    series = { ...series, ...notesPatch(series, second, 'Revisar el calendario') }
    expect(series.notesByDate).toEqual({ '2026-09-01': 'Presupuesto aprobado', '2026-09-08': 'Revisar el calendario' })
    expect(notesOf(occurrencesOf(series, 1))).toBe('Presupuesto aprobado')
    expect(notesOf(occurrencesOf(series, 8))).toBe('Revisar el calendario')
    expect(notesOf(occurrencesOf(series, 15))).toBe('')
    expect(series.notes).toBeUndefined()
  })

  it('borrar el texto de un día quita solo esa fecha', () => {
    const series = { ...weekly, notesByDate: { '2026-09-01': 'a', '2026-09-08': 'b' } }
    expect(notesPatch(series, occurrencesOf(series, 1), '  ')).toEqual({ notesByDate: { '2026-09-08': 'b' } })
  })

  it('las reuniones únicas usan el campo notes', () => {
    const single = { id: 's', start: d(3, 9).toISOString(), end: d(3, 10).toISOString(), recurrence: null }
    const occurrence = expandEvents([single], d(3, 0), d(4, 0))[0]
    expect(notesPatch(single, occurrence, 'Hecho')).toEqual({ notes: 'Hecho' })
    expect(notesOf({ ...occurrence, notes: 'Hecho' })).toBe('Hecho')
    expect(hasNotes(occurrence)).toBe(false)
  })

  it('resume el principio de las notas en una línea', () => {
    expect(notesPreview('Uno\n\ndos   tres')).toBe('Uno dos tres')
    expect(notesPreview('a'.repeat(100), 10)).toBe(`${'a'.repeat(9)}…`)
  })
})

describe('lista "Sin notas"', () => {
  const now = d(10, 12)
  const single = (id, day, extra = {}) => ({
    id,
    title: id,
    start: d(day, 9).toISOString(),
    end: d(day, 10).toISOString(),
    recurrence: null,
    ...extra,
  })

  it('incluye las reuniones terminadas de los últimos 7 días sin notas, de la más reciente a la más antigua', () => {
    const events = [
      single('ayer', 9),
      single('con notas', 9, { notes: 'Hecho' }),
      single('hace 8 días', 2),
      single('mañana', 11),
      single('no disponible', 8, { isUnavailable: true }),
      single('provisional', 8, { provisional: true, proposalId: 'p' }),
      { ...single('en curso', 10), start: d(10, 11).toISOString(), end: d(10, 13).toISOString() },
    ]
    expect(meetingsMissingNotes(events, now).map((ev) => ev.title)).toEqual(['ayer'])
  })

  it('cuenta cada día de una reunión que se repite según sus propias notas', () => {
    const daily = {
      ...single('diaria', 6),
      recurrence: { freq: 'daily', until: null },
      notesByDate: { '2026-09-08': 'Hablado' },
    }
    const missing = meetingsMissingNotes([daily], now)
    expect(missing.map((ev) => ev.start.getDate())).toEqual([10, 9, 7, 6])
  })
})

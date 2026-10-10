import { describe, expect, it } from 'vitest'
import { joinNames, minutesAttendees, minutesData, minutesFileName, minutesMessage, minutesSentText, minutesWhen } from './minutes'
import { buildMinutesPdf } from './minutesPdf'

const contacts = [
  { id: 'ana', name: 'Ana López', email: 'ana@x.es' },
  { id: 'luis', name: 'Luis Pérez' },
]
const event = {
  id: 'e1',
  title: 'Kickoff',
  start: new Date(2026, 9, 14, 10, 0).toISOString(),
  end: new Date(2026, 9, 14, 11, 0).toISOString(),
  participantIds: ['ana', 'luis'],
  guests: ['Eva Ruiz'],
}
const session = {
  agenda: [
    { id: 'a1', text: 'Presupuesto', done: true },
    { id: 'a2', text: 'Calendario', done: false },
  ],
  notes: 'Ideas:\n1. Subir precios\n  - En enero\n2. Nueva web',
  decisions: [{ id: 'd1', text: 'Se contrata a una diseñadora' }],
}
const tasks = [
  { id: 't1', title: 'Pedir presupuestos', assignee: 'ana', dueDate: '2026-10-20', status: 'pending' },
  { id: 't2', title: 'Revisar la web', assignee: 'me', dueDate: null, status: 'done' },
]

describe('acta para enviar', () => {
  it('asistentes: yo (convoca) y los participantes; sin mí en «Yo no asisto»', () => {
    expect(minutesAttendees(event, contacts, 'Norma')).toEqual(['Norma (convoca)', 'Ana López', 'Luis Pérez', 'Eva Ruiz'])
    expect(minutesAttendees(event, contacts, '')[0]).toBe('Organizador (convoca)')
    expect(minutesAttendees({ ...event, notAttending: true }, contacts, 'Norma')).toEqual(['Ana López', 'Luis Pérez', 'Eva Ruiz'])
  })

  it('datos del PDF: agenda, notas con listas, decisiones y tareas', () => {
    const data = minutesData({ event, session, contacts, tasks, organizerName: 'Norma' })
    expect(data.title).toBe('Kickoff')
    expect(data.when).toBe('Miércoles, 14 de octubre de 2026 · 10:00 – 11:00')
    expect(data.agenda).toEqual([
      { text: 'Presupuesto', done: true },
      { text: 'Calendario', done: false },
    ])
    expect(data.notes[1]).toMatchObject({ type: 'list', kind: 'number' })
    expect(data.decisions).toEqual(['Se contrata a una diseñadora'])
    expect(data.tasks).toEqual([
      { title: 'Pedir presupuestos', assignee: 'Ana López', due: '20/10/2026', done: false },
      { title: 'Revisar la web', assignee: 'Norma', due: 'Sin fecha', done: true },
    ])
  })

  it('mensaje de plantilla, en plural o en singular', () => {
    expect(minutesMessage(event, contacts)).toBe(
      'Hola, Ana, Luis y Eva. Os envío el acta de la reunión «Kickoff» del 14 de octubre. ¿Podéis revisarla y decirme si está todo correcto? Gracias.',
    )
    expect(minutesMessage({ ...event, participantIds: ['ana'], guests: [] }, contacts)).toBe(
      'Hola, Ana. Te envío el acta de la reunión «Kickoff» del 14 de octubre. ¿Puedes revisarla y decirme si está todo correcto? Gracias.',
    )
    expect(joinNames(['Ana', 'Luis'])).toBe('Ana y Luis')
  })

  it('nombre del archivo y fecha de envío', () => {
    expect(minutesFileName({ ...event, title: 'Plan: Q4/2026' })).toBe('Acta - Plan Q4 2026 - 2026-10-14.pdf')
    expect(minutesSentText(new Date(2026, 9, 14, 12, 5).toISOString())).toBe('Acta enviada el 14 de octubre de 2026 a las 12:05')
    expect(minutesSentText('')).toBe('')
    expect(minutesWhen({ start: new Date(2026, 9, 14, 23).toISOString(), end: new Date(2026, 9, 15, 1).toISOString() })).toContain('23:00 – 15 de octubre 01:00')
  })

  it('genera el PDF', async () => {
    const data = minutesData({ event, session, contacts, tasks, organizerName: 'Norma' })
    const blob = await buildMinutesPdf(data)
    expect(blob.size).toBeGreaterThan(2000)
    const text = await blob.text()
    expect(text.startsWith('%PDF-')).toBe(true)
  })
})

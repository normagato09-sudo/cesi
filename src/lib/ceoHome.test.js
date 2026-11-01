import { describe, expect, it } from 'vitest'
import { accountsToPromote, attentionItems, goalsDonePercent, meetingsToday, newStudentAccounts } from './ceoHome'

describe('Inicio de la ceo', () => {
  const now = new Date('2030-11-10T12:00:00Z')
  const profiles = [
    { id: 'n', role: 'alumno', email: 'Nuevo@x.com', created_at: '2030-11-08T10:00:00Z' },
    { id: 'v', role: 'alumno', email: 'viejo@x.com', created_at: '2030-10-01T10:00:00Z' },
    { id: 'a', role: 'alumno', email: 'ana@cifa.com', created_at: '2030-10-01T10:00:00Z' },
    { id: 'p', role: 'pendiente', email: 'p@x.com', created_at: '2030-09-01T10:00:00Z' },
    { id: 'e', role: 'equipo', email: 'luis@cifa.com', created_at: '2030-11-09T10:00:00Z' },
  ]
  const contacts = [
    { id: 'c1', email: ' ANA@cifa.com', teamProfile: { status: 'active' } },
    { id: 'c2', email: 'viejo@x.com', teamProfile: { status: 'former' } },
    { id: 'c3', email: 'nuevo@x.com' },
  ]

  it('alumnos nuevos de la semana y cuentas para pasar a equipo', () => {
    expect(newStudentAccounts(profiles, now).map((p) => p.id)).toEqual(['n'])
    expect(accountsToPromote(profiles, contacts).map((p) => p.id)).toEqual(['a', 'p'])
  })

  it('solo las filas con algo, cada una con su pantalla', () => {
    expect(attentionItems({})).toEqual([])
    const items = attentionItems({ newStudents: 2, stale: 1, overdue: 0, proposals: 1 })
    expect(items.map((i) => [i.count, i.label, i.section])).toEqual([
      [2, 'alumnos nuevos para revisar', 'access'],
      [1, 'fichaje sin salida', 'clockins'],
      [1, 'propuesta de reunión pendiente', 'calendar'],
    ])
  })

  it('% de objetivos conseguidos', () => {
    expect(goalsDonePercent([])).toBe(null)
    expect(goalsDonePercent([{ status: 'conseguido' }, { status: 'en_curso' }, { status: 'no_conseguido' }])).toBe(33)
  })

  it('reuniones de hoy, también las compartidas, por hora', () => {
    const day = new Date(2030, 10, 10, 8, 0)
    const at = (h) => new Date(2030, 10, 10, h, 0).toISOString()
    const raw = [
      { id: 'm', title: 'Mía', start: at(16), end: at(17), participantIds: ['c1'], guests: [] },
      { id: 'x', title: 'Mañana', start: new Date(2030, 10, 11, 9).toISOString(), end: new Date(2030, 10, 11, 10).toISOString(), participantIds: ['c1'], guests: [] },
    ]
    const shared = [
      { id: 's', title: 'Compartida', starts_at: at(10), ends_at: at(11), my_status: 'accepted' },
      { id: 'd', title: 'Rechazada', starts_at: at(12), ends_at: at(13), my_status: 'declined' },
    ]
    expect(meetingsToday(raw, shared, day).map((e) => e.title)).toEqual(['Compartida', 'Mía'])
  })
})

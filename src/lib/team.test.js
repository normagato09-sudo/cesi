import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_AREAS,
  addArea,
  filterMembers,
  getTeamAreas,
  saveTeamAreas,
  calendarSpan,
  seniorityText,
  joinedLine,
  milestonesToBio,
  migrateTeamProfile,
} from './team'

const now = new Date(2026, 8, 24, 12, 0) // 24 sept 2026

describe('antigüedad', () => {
  const on = (y, m, d) => new Date(y, m - 1, d, 12, 0)

  it('menos de 1 mes: días o semanas', () => {
    expect(seniorityText('2026-09-03', now)).toBe('se incorporó hace 3 semanas')
    expect(seniorityText('2026-09-17', now)).toBe('se incorporó hace 1 semana')
    expect(seniorityText('2026-09-19', now)).toBe('se incorporó hace 5 días')
    expect(seniorityText('2026-09-23', now)).toBe('se incorporó ayer')
    expect(seniorityText('2026-09-24', now)).toBe('se incorporó hoy')
    expect(seniorityText('2026-10-05', now)).toBe('se incorpora el 5 de octubre de 2026')
  })

  it('entre 1 mes y 1 año: meses y días', () => {
    expect(seniorityText('2026-07-30', on(2026, 8, 30))).toBe('lleva 1 mes')
    expect(seniorityText('2026-07-30', now)).toBe('lleva 1 mes y 25 días')
    expect(seniorityText('2026-07-24', now)).toBe('lleva 2 meses')
    expect(seniorityText('2026-06-23', now)).toBe('lleva 3 meses y 1 día')
    expect(seniorityText('2026-04-20', now)).toBe('lleva 5 meses y 4 días')
  })

  it('1 año o más: años y meses', () => {
    expect(seniorityText('2025-07-10', now)).toBe('lleva 1 año y 2 meses')
    expect(seniorityText('2024-09-24', now)).toBe('lleva 2 años')
    expect(seniorityText('2024-06-10', now)).toBe('lleva 2 años y 3 meses')
    expect(seniorityText('2025-09-24', now)).toBe('lleva 1 año')
  })

  it('finales de mes: del 31/01 al 28/02 es 1 mes', () => {
    expect(calendarSpan(on(2026, 1, 31), on(2026, 2, 28))).toEqual({ months: 1, days: 0 })
    expect(calendarSpan(on(2026, 7, 30), on(2026, 9, 24))).toEqual({ months: 1, days: 25 })
    expect(calendarSpan(on(2026, 1, 31), on(2026, 2, 27))).toEqual({ months: 0, days: 27 })
    expect(calendarSpan(on(2024, 1, 31), on(2024, 2, 29))).toEqual({ months: 1, days: 0 })
    expect(calendarSpan(on(2026, 3, 31), on(2026, 4, 30))).toEqual({ months: 1, days: 0 })
    expect(seniorityText('2026-01-31', on(2026, 2, 28))).toBe('lleva 1 mes')
  })

  it('antiguos miembros: el mismo formato hasta la salida', () => {
    expect(seniorityText('2025-01-15', now, '2026-04-20')).toBe('estuvo 1 año y 3 meses')
    expect(seniorityText('2026-01-01', now, '2026-01-22')).toBe('estuvo 3 semanas')
    expect(seniorityText('2026-07-30', now, '2026-09-24')).toBe('estuvo 1 mes y 25 días')
    expect(seniorityText('2026-01-01', now, '2026-01-01')).toBe('estuvo 1 día')
  })

  it('sin fecha o con fecha inválida no dice nada', () => {
    expect(seniorityText('', now)).toBe('')
    expect(seniorityText('no', now)).toBe('')
  })
})

describe('hitos → trayectoria', () => {
  it('los hitos pasan al final de la trayectoria, ordenados por fecha, y se borran', () => {
    const profile = {
      role: 'Moderador',
      bio: 'Moderador de la comunidad desde el principio.',
      milestones: [
        { id: 'c', date: '2026-08-15', text: 'Organizó el primer evento' },
        { id: 'x', date: '', text: 'Sin fecha' },
        { id: 'a', date: '2026-07-30', text: 'Se incorporó como moderador' },
        { id: 'b', date: '2026-08-15', text: 'Mismo día, escrito después' },
        { id: 'v', date: '2026-09-01', text: '   ' },
      ],
    }
    const migrated = milestonesToBio(profile)
    expect(migrated).not.toHaveProperty('milestones')
    expect(migrated.bio).toBe(
      [
        'Moderador de la comunidad desde el principio.',
        '30/07/2026 – Se incorporó como moderador',
        '15/08/2026 – Organizó el primer evento',
        '15/08/2026 – Mismo día, escrito después',
        'Sin fecha',
      ].join('\n'),
    )
    expect(migrated.role).toBe('Moderador')
    // Ya migrado: no cambia.
    expect(milestonesToBio(migrated)).toBe(migrated)
  })

  it('sin trayectoria, la trayectoria son los hitos; sin hitos, solo se borra la lista vacía', () => {
    expect(milestonesToBio({ bio: '', milestones: [{ id: 'a', date: '2025-01-02', text: 'Curso' }] }).bio).toBe('02/01/2025 – Curso')
    expect(milestonesToBio({ bio: 'Texto', milestones: [] })).toEqual({ bio: 'Texto' })
  })

  it('se aplica al leer los contactos junto con las otras migraciones', () => {
    const contact = {
      id: 'a',
      name: 'Ana',
      email: 'ana@gmail.com',
      teamProfile: { bio: '', email: 'ana@cesi.es', social: { instagram: 'ana' }, milestones: [{ id: 'm', date: '2026-07-30', text: 'Entró' }] },
    }
    const migrated = migrateTeamProfile(contact)
    expect(migrated.teamProfile).toEqual({ bio: '30/07/2026 – Entró', links: [expect.objectContaining({ url: 'https://instagram.com/ana' })] })
    expect(migrated.notes).toBe('Otro email: ana@cesi.es')
    expect(migrateTeamProfile(migrated)).toBe(migrated)
  })

  it('texto de incorporación', () => {
    expect(joinedLine('2026-07-30', 'moderador')).toBe('30/07/2026 – Se incorporó como moderador')
    expect(joinedLine('2026-07-30', '')).toBe('30/07/2026 – Se incorporó al equipo')
  })
})

describe('áreas y búsqueda', () => {
  beforeEach(() => localStorage.clear())

  it('la lista de áreas se puede ampliar y se guarda', () => {
    expect(getTeamAreas()).toEqual(DEFAULT_AREAS)
    const next = addArea(getTeamAreas(), '  Producción ')
    expect(addArea(next, 'producción')).toBe(next)
    saveTeamAreas(next)
    expect(getTeamAreas().at(-1)).toBe('Producción')
  })

  it('filtra por estado, área y texto', () => {
    const contacts = [
      { id: '1', name: 'Ana', teamProfile: { status: 'active', area: 'Radio', role: 'Locutora' } },
      { id: '2', name: 'Bea', teamProfile: { status: 'former', area: 'Radio', role: 'Técnica' } },
      { id: '3', name: 'Carlos', teamProfile: { status: 'active', area: 'Doblaje', role: 'Director' } },
      { id: '4', name: 'Sin perfil' },
    ]
    const names = (f) => filterMembers(contacts, f).map((c) => c.name)
    expect(names({})).toEqual(['Ana', 'Carlos'])
    expect(names({ status: 'former' })).toEqual(['Bea'])
    expect(names({ area: 'Radio' })).toEqual(['Ana'])
    expect(names({ query: 'director' })).toEqual(['Carlos'])
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import {
  candidatesByStatus,
  contactsForList,
  expiredDiscarded,
  incorporate,
  incorporationDraft,
  interviewUpdates,
  newCandidacy,
  newVacancy,
  planErasure,
  vacanciesStore,
  getAllVacancies,
  vacancyCountsText,
  withStatus,
} from './vacancies'
import { buildBackup, parseBackup, restoreBackup } from './backup'
import { contactFileRefs } from './files/contactFiles'

const now = new Date(2026, 8, 24, 12, 0)
const vacancy = { id: 'v1', ...newVacancy({ title: 'Profesora de doblaje', area: 'Doblaje', openedAt: '2026-09-01' }) }
const candidate = (id, status, extra = {}) => ({
  id,
  name: `Candidato ${id}`,
  country: 'ES',
  timeZone: 'Europe/Madrid',
  candidacy: { ...newCandidacy('v1', { now: new Date(2026, 8, 2) }), status, ...extra },
})

describe('estado de los candidatos', () => {
  it('cada cambio queda en el historial con su fecha; al descartar se guarda la fecha de descarte', () => {
    const c = newCandidacy('v1', { now: new Date(2026, 8, 2) })
    const interview = withStatus(c, 'interview', new Date(2026, 8, 5))
    const discarded = withStatus(interview, 'discarded', new Date(2026, 8, 10))
    expect(discarded.history.map((h) => h.status)).toEqual(['new', 'interview', 'discarded'])
    expect(discarded.discardedAt).toBe(new Date(2026, 8, 10).toISOString())
    expect(withStatus(discarded, 'interview', now).discardedAt).toBeNull()
    expect(withStatus(c, 'new', now)).toBe(c)
  })

  it('se agrupan en columnas por estado', () => {
    const contacts = [candidate('a', 'new'), candidate('b', 'interview'), candidate('c', 'new'), { id: 'x', name: 'Otro' }]
    expect(candidatesByStatus('v1', contacts).map((col) => [col.status, col.candidates.map((c) => c.id)])).toEqual([
      ['new', ['a', 'c']],
      ['interview', ['b']],
      ['accepted', []],
      ['discarded', []],
    ])
  })

  it('al crear una entrevista, los candidatos en "nuevo" pasan a "entrevista"', () => {
    const contacts = [candidate('a', 'new'), candidate('b', 'accepted'), { id: 'x', name: 'Otro' }]
    const meeting = { category: 'Entrevista', tags: ['entrevista'], participantIds: ['a', 'b', 'x'] }
    const updates = interviewUpdates(meeting, contacts, now)
    expect(updates.map((u) => [u.id, u.candidacy.status])).toEqual([['a', 'interview']])
    expect(interviewUpdates({ ...meeting, category: 'Reunión', tags: [] }, contacts, now)).toEqual([])
  })
})

describe('incorporar al equipo', () => {
  it('el perfil se abre con "DD/MM/AAAA – Se incorporó como [cargo]" al principio de la trayectoria', () => {
    const draft = incorporationDraft(vacancy, now)
    expect(draft).toMatchObject({ role: 'Profesora de doblaje', area: 'Doblaje', joinedAt: '2026-09-24' })
    expect(draft.bio).toBe('24/09/2026 – Se incorporó como Profesora de doblaje')
    expect(draft).not.toHaveProperty('milestones')
  })

  it('el candidato pasa a ser miembro con la trayectoria que se guardó, y la vacante queda cubierta', () => {
    const cv = { store: 'cloud', path: 'u/cvs/1.pdf' }
    const ana = candidate('ana', 'accepted', { cv })
    const contacts = [ana, candidate('b', 'interview'), candidate('c', 'new'), candidate('d', 'discarded')]
    // La línea de incorporación es editable antes de guardar.
    const bio = '24/09/2026 – Se incorporó como profesora titular\nActriz de doblaje desde 2015.'
    const profile = { ...incorporationDraft(vacancy, now), bio }
    const result = incorporate({ contact: ana, vacancy, teamProfile: profile, contacts })

    expect(result.contactPatch.candidacy).toBeNull()
    expect(result.contactPatch.teamProfile).toMatchObject({ status: 'active', role: 'Profesora de doblaje', area: 'Doblaje', bio, cv })
    expect(result.contactPatch.teamProfile).not.toHaveProperty('milestones')
    expect(result.vacancyPatch).toEqual({ status: 'filled', hiredContactIds: ['ana'] })
    expect(result.remaining.map((c) => c.id)).toEqual(['b', 'c'])
  })
})

describe('aviso de los 6 meses', () => {
  const discardedOn = (id, date) => candidate(id, 'discarded', { discardedAt: date.toISOString() })

  it('solo cuenta los descartados hace 6 meses o más', () => {
    const contacts = [
      discardedOn('viejo', new Date(2026, 1, 1)),
      discardedOn('justo', new Date(2026, 2, 24, 12, 0)),
      discardedOn('reciente', new Date(2026, 5, 1)),
      candidate('activo', 'interview'),
      { id: 'x', name: 'Contacto normal' },
    ]
    expect(expiredDiscarded(contacts, now).map((c) => c.id)).toEqual(['viejo', 'justo'])
  })

  it('el borrado quita al candidato de sus reuniones y deja un registro anónimo en la vacante', () => {
    const old = discardedOn('viejo', new Date(2026, 1, 1))
    const events = [
      { id: 'e1', participantIds: ['viejo', 'ana'], participants: ['Candidato viejo', 'Ana'] },
      { id: 'e2', participantIds: ['ana'], participants: ['Ana'] },
    ]
    const plan = planErasure([old], events, [vacancy], now)
    expect(plan.contactIds).toEqual(['viejo'])
    expect(plan.eventPatches).toEqual([{ id: 'e1', patch: { participantIds: ['ana'], participants: ['Ana'] } }])
    expect(plan.vacancyPatches.v1).toEqual([{ discardedAt: old.candidacy.discardedAt, erasedAt: now.toISOString() }])
  })

  it('el borrado también quita al candidato de los días cambiados de una serie', () => {
    const old = discardedOn('viejo', new Date(2026, 1, 1))
    const series = {
      id: 's',
      participantIds: ['ana'],
      participants: ['Ana'],
      exceptions: { '2026-03-02': { participantIds: ['ana', 'viejo'], participants: ['Ana', 'Candidato viejo'] } },
    }
    const plan = planErasure([old], [series], [vacancy], now)
    expect(plan.eventPatches).toEqual([
      { id: 's', patch: { exceptions: { '2026-03-02': { participantIds: ['ana'], participants: ['Ana'] } } } },
    ])
  })
})

describe('lista de contactos y recuentos', () => {
  const contacts = [{ id: 'x', name: 'Contacto normal' }, candidate('a', 'new'), candidate('b', 'discarded')]

  it('los candidatos solo aparecen en Contactos con el filtro Candidatos', () => {
    expect(contactsForList(contacts).map((c) => c.id)).toEqual(['x'])
    expect(contactsForList(contacts, true).map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('cuenta los candidatos actuales y los borrados (registro anónimo)', () => {
    expect(vacancyCountsText(vacancy, contacts)).toBe('2 candidatos')
    const withErased = { ...vacancy, erasedCandidates: [{ discardedAt: 'x', erasedAt: 'y' }] }
    expect(vacancyCountsText(withErased, [contacts[1]])).toBe('1 candidato · 1 candidato descartado')
  })

  it('el borrado también quita al candidato de las propuestas', () => {
    const old = candidate('viejo', 'discarded', { discardedAt: new Date(2026, 1, 1).toISOString() })
    const proposals = [{ id: 'p1', participantIds: ['viejo', 'ana'] }, { id: 'p2', participantIds: ['ana'] }]
    const plan = planErasure([old], [], [vacancy], now, proposals)
    expect(plan.proposalPatches).toEqual([{ id: 'p1', patch: { participantIds: ['ana'] } }])
  })

  it('el CV de un candidato incorporado sigue enlazado al contacto (se borra con él)', () => {
    const cv = { store: 'cloud', path: 'u/cvs/1.pdf' }
    const refs = contactFileRefs({ photo: null, teamProfile: { cv } })
    expect(refs).toEqual([{ ref: cv, folder: 'cvs' }])
  })
})

describe('copia de seguridad', () => {
  beforeEach(() => localStorage.clear())

  it('incluye las vacantes y acepta copias antiguas sin ellas', () => {
    vacanciesStore.create(newVacancy({ title: 'Locutor/a', area: 'Radio' }))
    const backup = buildBackup()
    expect(backup.vacancies).toHaveLength(1)
    localStorage.clear()
    restoreBackup(parseBackup(JSON.stringify(backup)))
    expect(getAllVacancies()[0]).toMatchObject({ title: 'Locutor/a', status: 'open' })
    restoreBackup(parseBackup(JSON.stringify({ app: 'cesi', version: 9, events: [], contacts: [] })))
    expect(getAllVacancies()).toEqual([])
  })
})

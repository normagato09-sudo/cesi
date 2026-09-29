import { beforeEach, describe, expect, it } from 'vitest'
import {
  candidaciesOf,
  candidatesByStatus,
  candidatesOf,
  contactsForList,
  expiredDiscarded,
  findCandidacy,
  incorporate,
  incorporationDraft,
  interviewUpdates,
  isCandidateOnly,
  latestCandidacy,
  migrateCandidacy,
  newCandidacy,
  newVacancy,
  planErasure,
  removeCandidacyPlan,
  vacanciesStore,
  getAllVacancies,
  vacancyCountsText,
  withStatus,
} from './vacancies'
import { acceptRole } from './trajectory'
import { buildBackup, parseBackup, restoreBackup } from './backup'
import { createContact, getAllContacts } from './contacts'
import { contactFileRefs } from './files/contactFiles'

const now = new Date(2026, 8, 24, 12, 0)
const vacancy = { id: 'v1', ...newVacancy({ title: 'Profesora de doblaje', area: 'Doblaje', openedAt: '2026-09-01' }) }
const other = { id: 'v2', ...newVacancy({ title: 'Locutor/a', area: 'Radio', openedAt: '2026-09-10' }) }
const candidacy = (id, status, extra = {}) => ({
  ...newCandidacy('v1', { appliedAt: '2026-09-02', now: new Date(2026, 8, 2) }),
  id: `cand-${id}`,
  status,
  ...extra,
})
// Contacto que existe solo por ser candidato, con una candidatura a v1.
const candidate = (id, status, extra = {}) => ({
  id,
  name: `Candidato ${id}`,
  country: 'ES',
  timeZone: 'Europe/Madrid',
  candidateOnly: true,
  candidacies: [candidacy(id, status, extra)],
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
    expect(candidatesByStatus('v1', contacts).map((col) => [col.status, col.candidates.map((e) => e.contact.id)])).toEqual([
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
    expect(updates.map((u) => [u.id, u.patch.candidacies.map((c) => c.status)])).toEqual([['a', ['interview']]])
    expect(interviewUpdates({ ...meeting, category: 'Reunión', tags: [] }, contacts, now)).toEqual([])
  })
})

describe('varias candidaturas por persona', () => {
  it('la candidatura única del formato antiguo pasa a la lista, con las notas del contacto', () => {
    const old = { id: 'a', name: 'Ana', notes: 'Muy buena voz', candidacy: { vacancyId: 'v1', appliedAt: '2026-09-02', status: 'new', history: [], cv: null } }
    const migrated = migrateCandidacy(old)
    expect(migrated).not.toHaveProperty('candidacy')
    expect(migrated).toMatchObject({ notes: '', candidateOnly: true })
    expect(migrated.candidacies).toEqual([{ ...old.candidacy, id: 'cand-a', notes: 'Muy buena voz' }])
    expect(migrateCandidacy(migrated)).toBe(migrated)
  })

  it('un contacto se ve en cada vacante a la que se ha presentado', () => {
    const ana = { ...candidate('ana', 'new'), candidateOnly: false }
    ana.candidacies.push({ ...newCandidacy('v2'), id: 'cand-ana-2', appliedAt: '2026-09-20' })
    expect(candidatesOf('v1', [ana]).map((e) => e.candidacy.id)).toEqual(['cand-ana'])
    expect(candidatesOf('v2', [ana]).map((e) => e.candidacy.id)).toEqual(['cand-ana-2'])
    expect(findCandidacy([ana], 'cand-ana-2').contact).toBe(ana)
    expect(latestCandidacy(ana).id).toBe('cand-ana-2')
  })

  it('en Contactos solo se esconden los que existen solo por ser candidatos', () => {
    const member = { id: 'm', name: 'Miembro', teamProfile: { status: 'active' }, candidacies: [candidacy('m', 'new')] }
    const contact = { id: 'n', name: 'Contacto', candidacies: [candidacy('n', 'new')] }
    const contacts = [{ id: 'x', name: 'Contacto normal' }, candidate('a', 'new'), member, contact]
    expect(isCandidateOnly(member)).toBe(false)
    expect(contactsForList(contacts).map((c) => c.id)).toEqual(['x', 'm', 'n'])
    expect(contactsForList(contacts, true).map((c) => c.id)).toEqual(['a', 'm', 'n'])
  })

  it('quitar una candidatura: el contacto solo se borra si existía únicamente por ella', () => {
    const cv = { store: 'cloud', path: 'u/cvs/1.pdf' }
    const only = candidate('a', 'new', { cv })
    expect(removeCandidacyPlan(only, 'cand-a')).toEqual({ deleteContact: true, files: [cv] })

    const member = { id: 'm', name: 'Miembro', teamProfile: { status: 'active' }, candidacies: [candidacy('m', 'new', { cv })] }
    expect(removeCandidacyPlan(member, 'cand-m')).toEqual({ deleteContact: false, patch: { candidacies: [] }, files: [cv] })

    const two = candidate('b', 'new')
    two.candidacies.push({ ...candidacy('b2', 'new'), vacancyId: 'v2' })
    expect(removeCandidacyPlan(two, 'cand-b')).toMatchObject({ deleteContact: false, patch: { candidacies: [expect.objectContaining({ id: 'cand-b2' })] } })
  })

  it('los CV de todas sus candidaturas se guardan con el contacto', () => {
    const a = { store: 'cloud', path: 'u/cvs/a.pdf' }
    const b = { store: 'device', id: 'b' }
    expect(contactFileRefs({ candidacies: [{ cv: a }, { cv: b }, { cv: { url: 'https://x' } }] }).map((r) => r.ref)).toEqual([a, b])
  })
})

describe('incorporar al equipo', () => {
  it('el perfil se abre con el cargo y el departamento de la vacante y hoy como fecha de inicio', () => {
    const draft = incorporationDraft(vacancy, now)
    expect(draft).toMatchObject({ role: 'Profesora de doblaje', area: 'Doblaje', joinedAt: '2026-09-24' })
    expect(draft).not.toHaveProperty('milestones')
  })

  it('el candidato pasa a ser miembro con la trayectoria que se guardó, y la vacante queda cubierta', () => {
    const cv = { store: 'cloud', path: 'u/cvs/1.pdf' }
    const ana = candidate('ana', 'interview', { cv })
    const contacts = [ana, candidate('b', 'interview'), candidate('c', 'new'), candidate('d', 'discarded')]
    const roles = [{ id: 'r1', role: 'Profesora de doblaje', area: 'Doblaje', start: '2026-09-24', end: null }]
    const profile = { ...incorporationDraft(vacancy, now), roles }
    const result = incorporate({ contact: ana, candidacyId: 'cand-ana', vacancy, teamProfile: profile, contacts, now })

    expect(result.contactPatch.candidacies.map((c) => c.status)).toEqual(['accepted'])
    expect(result.contactPatch.candidateOnly).toBe(false)
    expect(result.contactPatch.teamProfile).toMatchObject({ status: 'active', role: 'Profesora de doblaje', area: 'Doblaje', roles, cv })
    expect(result.vacancyPatch).toEqual({ status: 'filled', hiredContactIds: ['ana'] })
    expect(result.remaining.map((e) => e.contact.id)).toEqual(['b', 'c'])
  })

  it('quien ya es del equipo recibe el rol nuevo: se suma o sustituye a los que se elijan', () => {
    const profile = {
      status: 'active',
      role: 'Mod',
      area: 'Moderación',
      roles: [
        { id: 'r1', role: 'Mod', area: 'Moderación', start: '2026-08-05', end: null },
        { id: 'r2', role: 'Profesor', area: 'Profesores', start: '2026-02-24', end: null },
      ],
      legacyTrajectory: { bio: 'x', role: 'Mod', area: 'Moderación', joinedAt: null },
    }
    const added = acceptRole(profile, { role: 'Profesora de doblaje', area: 'Doblaje', today: '2026-09-24' })
    expect(added.roles.filter((r) => !r.end).map((r) => r.role)).toEqual(['Profesora de doblaje', 'Mod', 'Profesor'])

    const replaced = acceptRole(profile, { role: 'Profesora de doblaje', area: 'Doblaje', closeIds: ['r1'], today: '2026-09-24' })
    expect(replaced.roles.map((r) => [r.role, r.end])).toEqual([
      ['Profesora de doblaje', null],
      ['Mod', '2026-09-24'],
      ['Profesor', null],
    ])
    expect(replaced).toMatchObject({ role: 'Profesora de doblaje', area: 'Doblaje', legacyTrajectory: profile.legacyTrajectory })

    const member = { id: 'm', name: 'Miembro', teamProfile: profile, candidacies: [candidacy('m', 'interview')] }
    const result = incorporate({ contact: member, candidacyId: 'cand-m', vacancy, teamProfile: replaced, contacts: [member], now })
    expect(result.contactPatch.teamProfile.roles).toHaveLength(3)
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
    expect(expiredDiscarded(contacts, now).map((e) => e.contact.id)).toEqual(['viejo', 'justo'])
  })

  it('el borrado quita al candidato de sus reuniones y deja un registro anónimo en la vacante', () => {
    const old = discardedOn('viejo', new Date(2026, 1, 1))
    const events = [
      { id: 'e1', participantIds: ['viejo', 'ana'], participants: ['Candidato viejo', 'Ana'] },
      { id: 'e2', participantIds: ['ana'], participants: ['Ana'] },
    ]
    const plan = planErasure(expiredDiscarded([old], now), events, [vacancy], now)
    expect(plan.contactIds).toEqual(['viejo'])
    expect(plan.eventPatches).toEqual([{ id: 'e1', patch: { participantIds: ['ana'], participants: ['Ana'] } }])
    expect(plan.vacancyPatches.v1).toEqual([{ discardedAt: candidaciesOf(old)[0].discardedAt, erasedAt: now.toISOString() }])
  })

  it('a quien no existía solo por esa candidatura se le quita la candidatura, no el contacto', () => {
    const cv = { store: 'cloud', path: 'u/cvs/1.pdf' }
    const member = {
      id: 'm',
      name: 'Miembro',
      teamProfile: { status: 'active' },
      candidacies: [candidacy('m', 'discarded', { discardedAt: new Date(2026, 1, 1).toISOString(), cv })],
    }
    const events = [{ id: 'e1', participantIds: ['m'], participants: ['Miembro'] }]
    const plan = planErasure(expiredDiscarded([member], now), events, [vacancy], now)
    expect(plan.contactIds).toEqual([])
    expect(plan.contactPatches).toEqual([{ id: 'm', patch: { candidacies: [] } }])
    expect(plan.files).toEqual([cv])
    expect(plan.eventPatches).toEqual([])
    expect(plan.vacancyPatches.v1).toHaveLength(1)
  })

  it('el borrado también quita al candidato de los días cambiados de una serie', () => {
    const old = discardedOn('viejo', new Date(2026, 1, 1))
    const series = {
      id: 's',
      participantIds: ['ana'],
      participants: ['Ana'],
      exceptions: { '2026-03-02': { participantIds: ['ana', 'viejo'], participants: ['Ana', 'Candidato viejo'] } },
    }
    const plan = planErasure(expiredDiscarded([old], now), [series], [vacancy], now)
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
    expect(vacancyCountsText(other, contacts)).toBe('0 candidatos')
    const withErased = { ...vacancy, erasedCandidates: [{ discardedAt: 'x', erasedAt: 'y' }] }
    expect(vacancyCountsText(withErased, [contacts[1]])).toBe('1 candidato · 1 candidato descartado')
  })

  it('el borrado también quita al candidato de las propuestas', () => {
    const old = candidate('viejo', 'discarded', { discardedAt: new Date(2026, 1, 1).toISOString() })
    const proposals = [{ id: 'p1', participantIds: ['viejo', 'ana'] }, { id: 'p2', participantIds: ['ana'] }]
    const plan = planErasure(expiredDiscarded([old], now), [], [vacancy], now, proposals)
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

  it('los candidatos de una copia antigua (una sola candidatura) se convierten al leerlos', () => {
    const old = { id: 'a', name: 'Ana', country: 'ES', timeZone: 'Europe/Madrid', candidacy: { vacancyId: 'v1', appliedAt: '2026-09-02', status: 'new', history: [] } }
    restoreBackup(parseBackup(JSON.stringify({ app: 'cesi', version: 14, events: [], contacts: [old] })))
    const [ana] = getAllContacts()
    expect(ana).not.toHaveProperty('candidacy')
    expect(ana.candidacies).toEqual([expect.objectContaining({ id: 'cand-a', vacancyId: 'v1' })])
    expect(isCandidateOnly(ana)).toBe(true)
    createContact({ name: 'Luis', country: 'ES', timeZone: 'Europe/Madrid' })
    expect(getAllContacts()).toHaveLength(2)
  })
})

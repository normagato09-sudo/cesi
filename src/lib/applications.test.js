import { describe, expect, it } from 'vitest'
import { findContactByEmail, findDuplicates, knownPersonText, normalizeName, planCandidacy, searchContacts } from './applications'
import { newCandidacy } from './vacancies'

const ana = { id: 'ana', name: 'Ana Pérez', email: 'Ana@Ejemplo.com', phone: '+34 600 111 222' }
const member = { id: 'm', name: 'Luis Gómez', email: 'luis@cesi.es', teamProfile: { status: 'active' } }
const former = { id: 'f', name: 'Marta Ruiz', teamProfile: { status: 'former' } }
const onlyCandidate = { id: 'c', name: 'Ana Pérez', candidateOnly: true, candidacies: [{ ...newCandidacy('v1'), id: 'cand-c' }] }
const contacts = [ana, member, former, onlyCandidate]

describe('personas que ya conocemos', () => {
  it('compara los nombres sin mayúsculas, acentos ni espacios de más', () => {
    expect(normalizeName('  ANA   Pérez ')).toBe('ana perez')
  })

  it('avisa de los contactos con el mismo email o el mismo nombre (primero el email)', () => {
    expect(findDuplicates(contacts, { name: 'ana perez', email: '' }).map((d) => [d.contact.id, d.by])).toEqual([
      ['ana', 'name'],
      ['c', 'name'],
    ])
    expect(findDuplicates(contacts, { name: 'Ana Pérez', email: ' ana@ejemplo.com ' }).map((d) => [d.contact.id, d.by])).toEqual([
      ['ana', 'email'],
      ['c', 'name'],
    ])
    expect(findDuplicates(contacts, { name: 'Ana', email: 'otra@ejemplo.com' })).toEqual([])
  })

  it('el buscador encuentra por nombre, email o teléfono', () => {
    expect(searchContacts(contacts, 'perez').map((c) => c.id)).toEqual(['ana', 'c'])
    expect(searchContacts(contacts, 'cesi.es').map((c) => c.id)).toEqual(['m'])
    expect(searchContacts(contacts, '111 222').map((c) => c.id)).toEqual(['ana'])
    expect(searchContacts(contacts, '  ')).toEqual([])
  })

  it('dice quién es cada uno', () => {
    expect(knownPersonText(member)).toBe('Ya es del equipo')
    expect(knownPersonText(former)).toBe('Fue del equipo')
    expect(knownPersonText(onlyCandidate)).toBe('Ya se había postulado')
    expect(knownPersonText(ana)).toBe('Ya es contacto')
    expect(findContactByEmail(contacts, 'LUIS@cesi.es')).toBe(member)
  })
})

describe('nueva candidatura sin duplicar a la persona', () => {
  it('persona nueva: se crea un contacto que solo es candidato', () => {
    const c = newCandidacy('v1')
    const plan = planCandidacy(contacts, { name: 'Nuevo', email: 'nuevo@x.com' }, c)
    expect(plan).toEqual({ action: 'create', contact: { name: 'Nuevo', email: 'nuevo@x.com', candidateOnly: true, candidacies: [c] } })
  })

  it('contacto elegido: se le añade la candidatura (puede tener varias) sin tocar sus datos', () => {
    const c = newCandidacy('v2')
    const plan = planCandidacy(contacts, {}, c, 'c')
    expect(plan).toMatchObject({ action: 'update', id: 'c', patch: { candidacies: [expect.objectContaining({ id: 'cand-c' }), c] } })
  })

  it('mismo email: la candidatura va a ese contacto y solo se completan los datos que le faltaban', () => {
    const c = newCandidacy('v1')
    const plan = planCandidacy(contacts, { name: 'Otro nombre', email: 'luis@CESI.es', phone: '+34 600 000 000' }, c)
    expect(plan).toMatchObject({ action: 'update', id: 'm', patch: { phone: '+34 600 000 000', candidacies: [c] } })
    expect(plan.patch).not.toHaveProperty('name')
  })

  it('si ya se había presentado a esa vacante, se actualiza esa candidatura', () => {
    const c = { ...newCandidacy('v1'), notes: 'Segunda vez' }
    const plan = planCandidacy(contacts, {}, c, 'c')
    expect(plan.patch.candidacies).toHaveLength(1)
    expect(plan.patch.candidacies[0]).toMatchObject({ id: 'cand-c', notes: 'Segunda vez' })
  })
})

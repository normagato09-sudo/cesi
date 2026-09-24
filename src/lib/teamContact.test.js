import { beforeEach, describe, expect, it } from 'vitest'
import { createContact, getAllContacts, updateContact } from './contacts'
import { filterMembers, mergeTeamContactData, removeFromTeamPatch, teamProfileDefaults } from './team'

const now = new Date(2026, 8, 24, 12, 0)

beforeEach(() => localStorage.clear())

describe('contacto → miembro del equipo', () => {
  it('el perfil sale ya rellenado con el cargo del contacto, hoy y sus enlaces', () => {
    const contact = {
      id: 'ana',
      name: 'Ana López',
      role: 'Moderadora',
      email: 'ana@ejemplo.com',
      links: [{ id: 'l1', label: '', url: 'https://instagram.com/ana' }],
    }
    const profile = teamProfileDefaults(contact, now)
    expect(profile).toMatchObject({ role: 'Moderadora', joinedAt: '2026-09-24', area: '', bio: '', status: 'active' })
    expect(profile.links).toEqual(contact.links)
    // Los datos del contacto no se copian al perfil: se quedan en el contacto.
    expect(profile).not.toHaveProperty('email')
    expect(teamProfileDefaults({ id: 'x', name: 'Sin cargo' }, now)).toMatchObject({ role: '', links: [] })
  })

  it('lo que se edita desde el perfil se guarda en el contacto y se ve en su ficha de equipo', () => {
    const c = createContact({ name: 'Ana', email: 'vieja@ejemplo.com', country: 'ES', timeZone: 'Europe/Madrid' })
    // Lo que guarda el perfil de equipo: los datos del contacto y el perfil solo con lo del equipo.
    updateContact(c.id, {
      name: 'Ana López',
      email: 'ana@cesi.es',
      phone: '+34 600 000 000',
      notes: 'Prefiere por la tarde',
      teamProfile: { ...teamProfileDefaults(c, now), role: 'Moderadora', area: 'Moderación' },
    })
    const saved = getAllContacts()[0]
    expect(saved).toMatchObject({ name: 'Ana López', email: 'ana@cesi.es', phone: '+34 600 000 000', notes: 'Prefiere por la tarde' })
    expect(saved.teamProfile).not.toHaveProperty('email')
    // Y al revés: si se edita el contacto, el miembro ya lo muestra (es la misma ficha).
    updateContact(c.id, { email: 'otro@cesi.es' })
    const [member] = filterMembers(getAllContacts(), { query: 'otro@cesi' })
    expect(member.email).toBe('otro@cesi.es')
  })

  it('al quitarlo del equipo conserva sus datos y sus enlaces en el contacto', () => {
    const contact = {
      id: 'ana',
      name: 'Ana',
      email: 'ana@cesi.es',
      links: [{ id: 'a', label: '', url: 'https://cesi.es' }],
      teamProfile: {
        role: 'x',
        links: [{ id: 'b', label: 'Portfolio', url: 'https://ana.dev' }, { id: 'c', label: '', url: 'cesi.es' }],
        social: { instagram: '@ana' },
      },
    }
    const patch = removeFromTeamPatch(contact)
    expect(patch.teamProfile).toBeNull()
    expect(patch.links.map((l) => l.url)).toEqual(['https://cesi.es', 'https://ana.dev', 'https://instagram.com/ana'])
    expect(patch).not.toHaveProperty('email')
  })
})

describe('fusión de datos duplicados (formato antiguo)', () => {
  it('copia al contacto lo que no tenía', () => {
    const merged = mergeTeamContactData({
      id: 'a',
      name: 'Ana',
      email: '',
      teamProfile: { role: 'x', email: 'ana@cesi.es', phone: '+34 611 111 111', photo: { store: 'cloud', path: 'u/p.webp' } },
    })
    expect(merged).toMatchObject({ email: 'ana@cesi.es', phone: '+34 611 111 111', photo: { path: 'u/p.webp' } })
    expect(merged.teamProfile).toEqual({ role: 'x' })
  })

  it('si los dos lo tienen y son distintos, conserva el del contacto y añade el otro a sus notas', () => {
    const merged = mergeTeamContactData({
      id: 'a',
      name: 'Ana',
      email: 'ana@gmail.com',
      phone: '+34 600 000 000',
      notes: 'Nota previa',
      teamProfile: { role: 'x', email: 'ana@cesi.es', phone: '+34 600 000 000' },
    })
    expect(merged.email).toBe('ana@gmail.com')
    expect(merged.notes).toBe('Nota previa\nOtro email: ana@cesi.es')
    expect(merged.teamProfile).toEqual({ role: 'x' })
    // Otra vez no cambia nada (no repite la nota).
    expect(mergeTeamContactData(merged)).toBe(merged)
  })

  it('se aplica al leer los contactos guardados (también los que llegan de la nube o de una copia)', () => {
    localStorage.setItem(
      'cesi_contacts_v1',
      JSON.stringify([
        { id: 'a', name: 'Ana', country: 'ES', timeZone: 'Europe/Madrid', email: 'ana@gmail.com', teamProfile: { role: 'x', email: 'ana@cesi.es' } },
        { id: 'b', name: 'Luis', country: 'ES', timeZone: 'Europe/Madrid' },
      ]),
    )
    const [ana, luis] = getAllContacts()
    expect(ana.notes).toBe('Otro email: ana@cesi.es')
    expect(ana.teamProfile).toEqual({ role: 'x' })
    expect(luis).not.toHaveProperty('teamProfile')
    expect(JSON.parse(localStorage.getItem('cesi_contacts_v1'))[0].teamProfile).toEqual({ role: 'x' })
  })
})

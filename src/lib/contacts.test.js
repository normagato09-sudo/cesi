import { beforeEach, describe, expect, it } from 'vitest'
import {
  contactDataFromText,
  contactInitials,
  contactMatches,
  createContact,
  eventIncludesContact,
  getAllContacts,
  participantsOf,
  updateContact,
  validateContactCountry,
} from './contacts'

beforeEach(() => localStorage.clear())

const SPAIN = { country: 'ES', timeZone: 'Europe/Madrid' }

describe('contactos', () => {
  it('ordena por nombre en español', () => {
    createContact({ name: 'Óscar', ...SPAIN })
    createContact({ name: 'ana', ...SPAIN })
    createContact({ name: 'Zoe', ...SPAIN })
    expect(getAllContacts().map((c) => c.name)).toEqual(['ana', 'Óscar', 'Zoe'])
  })

  it('calcula iniciales y busca sin acentos', () => {
    expect(contactInitials('Ana María López')).toBe('AL')
    expect(contactMatches({ name: 'Óscar', organization: 'Acme' }, 'oscar')).toBe(true)
    expect(contactMatches({ name: 'Óscar', organization: 'Acme' }, 'acm')).toBe(true)
  })

  it('crea datos de contacto desde un email', () => {
    expect(contactDataFromText('marta@cliente.es')).toEqual({ name: 'marta', email: 'marta@cliente.es' })
  })

  it('empareja eventos antiguos por nombre o email e ignora ids borrados', () => {
    const ana = createContact({ name: 'Ana', email: 'ana@x.com', ...SPAIN })
    const contacts = getAllContacts()
    const legacy = participantsOf({ participants: ['ANA@x.com', 'Pepe'] }, contacts)
    expect(legacy.contacts.map((c) => c.id)).toEqual([ana.id])
    expect(legacy.guests).toEqual(['Pepe'])
    const modern = participantsOf({ participantIds: [ana.id, 'borrado'], guests: [] }, contacts)
    expect(modern.contacts).toHaveLength(1)
    expect(eventIncludesContact({ participantIds: [], participants: ['Ana'] }, ana, contacts)).toBe(false)
  })
})

describe('país obligatorio', () => {
  it('no se guarda un contacto sin país', () => {
    expect(() => createContact({ name: 'Sin país' })).toThrow('El país es obligatorio.')
    expect(() => createContact({ name: 'Inventado', country: 'XX', timeZone: 'Europe/Madrid' })).toThrow('obligatorio')
    expect(getAllContacts()).toEqual([])
  })

  it('en países con varias zonas hay que elegir una válida', () => {
    expect(validateContactCountry({ country: 'US' })).toBe('Elige la ciudad o zona horaria de Estados Unidos.')
    expect(validateContactCountry({ country: 'US', timeZone: 'Europe/Madrid' })).toMatch(/Estados Unidos/)
    expect(validateContactCountry({ country: 'US', timeZone: 'America/Chicago' })).toBeNull()
    expect(validateContactCountry({ country: 'ES', timeZone: 'Atlantic/Canary' })).toBeNull()
  })

  it('no se puede quitar el país al editar', () => {
    const c = createContact({ name: 'Luis', country: 'MX', timeZone: 'America/Mexico_City' })
    expect(() => updateContact(c.id, { country: '', timeZone: '' })).toThrow('El país es obligatorio.')
    expect(getAllContacts()[0].country).toBe('MX')
  })

  it('migra los contactos antiguos sin país a España y los marca sin revisar', () => {
    localStorage.setItem(
      'cesi_contacts_v1',
      JSON.stringify([
        { id: 'a', name: 'Antiguo' },
        { id: 'b', name: 'Con país', country: 'MX', timeZone: 'America/Mexico_City' },
      ]),
    )
    const [antiguo, conPais] = getAllContacts()
    expect(antiguo).toMatchObject({ country: 'ES', timeZone: 'Europe/Madrid', countryUnreviewed: true })
    expect(conPais.countryUnreviewed).toBeUndefined()
    // La migración queda guardada y el aviso se quita al guardar el contacto.
    expect(JSON.parse(localStorage.getItem('cesi_contacts_v1'))[0].countryUnreviewed).toBe(true)
    updateContact('a', { country: 'ES', timeZone: 'Atlantic/Canary', countryUnreviewed: false })
    expect(getAllContacts()[0]).toMatchObject({ timeZone: 'Atlantic/Canary', countryUnreviewed: false })
  })
})

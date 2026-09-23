import { beforeEach, describe, expect, it } from 'vitest'
import {
  contactDataFromText,
  contactInitials,
  contactMatches,
  createContact,
  eventIncludesContact,
  getAllContacts,
  participantsOf,
} from './contacts'

beforeEach(() => localStorage.clear())

describe('contactos', () => {
  it('ordena por nombre en español', () => {
    createContact({ name: 'Óscar' })
    createContact({ name: 'ana' })
    createContact({ name: 'Zoe' })
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
    const ana = createContact({ name: 'Ana', email: 'ana@x.com' })
    const contacts = getAllContacts()
    const legacy = participantsOf({ participants: ['ANA@x.com', 'Pepe'] }, contacts)
    expect(legacy.contacts.map((c) => c.id)).toEqual([ana.id])
    expect(legacy.guests).toEqual(['Pepe'])
    const modern = participantsOf({ participantIds: [ana.id, 'borrado'], guests: [] }, contacts)
    expect(modern.contacts).toHaveLength(1)
    expect(eventIncludesContact({ participantIds: [], participants: ['Ana'] }, ana, contacts)).toBe(false)
  })
})

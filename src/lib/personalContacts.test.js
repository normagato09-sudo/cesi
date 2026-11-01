import { describe, expect, it } from 'vitest'
import { contactToRow, rowToContact } from './personalContacts'

describe('contactos personales', () => {
  it('de la fila a la forma de mis contactos (y de vuelta)', () => {
    const row = { id: 'x', name: 'Ana', organization: 'Sol SL', role: '', country: 'ES', time_zone: 'Europe/Madrid', email: 'a@sol.es', phone: '', notes: '', group_ids: ['g1'], created_at: 'c', updated_at: 'u' }
    const contact = rowToContact(row)
    expect(contact).toMatchObject({ id: 'x', name: 'Ana', timeZone: 'Europe/Madrid', groupIds: ['g1'], external: true })
    expect(contactToRow({ ...contact, name: ' Ana ', photo: 'no', availability: {} })).toEqual({
      name: 'Ana',
      organization: 'Sol SL',
      role: '',
      country: 'ES',
      time_zone: 'Europe/Madrid',
      email: 'a@sol.es',
      phone: '',
      notes: '',
      group_ids: ['g1'],
    })
  })

  it('el país y el nombre son obligatorios', () => {
    expect(() => contactToRow({ name: 'Ana', country: '', timeZone: '' })).toThrow(/país/)
    expect(() => contactToRow({ name: ' ', country: 'ES', timeZone: 'Europe/Madrid' })).toThrow(/nombre/)
  })
})

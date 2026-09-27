import { describe, expect, it, vi } from 'vitest'
import { contactFormPayload, loadContactForm, saveContactForm, tokenFromPath, validateContactForm } from './contactForm'
import { emptyWeek } from './weeklySchedule'

const TOKEN = 'A'.repeat(43)

function values(overrides = {}) {
  return {
    name: 'Ana López',
    email: 'ana@example.com',
    phone: '+34 600 000 000',
    organization: 'Acme',
    role: 'Directora',
    zone: { country: 'ES', timeZone: 'Europe/Madrid' },
    hasAvailability: false,
    availability: emptyWeek(),
    ...overrides,
  }
}

describe('token de la página /ficha/<token>', () => {
  it('lo saca de la ruta y rechaza lo que no parece un token', () => {
    expect(tokenFromPath(`/ficha/${TOKEN}`)).toBe(TOKEN)
    expect(tokenFromPath(`/ficha/${TOKEN}/`)).toBe(TOKEN)
    expect(tokenFromPath('/ficha/corto')).toBe(null)
    expect(tokenFromPath(`/ficha/${TOKEN}/otra`)).toBe(null)
    expect(tokenFromPath(`/ficha/${'A'.repeat(40)}%27`)).toBe(null)
    expect(tokenFromPath('/')).toBe(null)
  })
})

describe('formulario público del contacto', () => {
  it('valida nombre, longitudes, email, país y disponibilidad', () => {
    expect(validateContactForm(values())).toBe(null)
    expect(validateContactForm(values({ name: '  ' }))).toBe('Escribe tu nombre.')
    expect(validateContactForm(values({ phone: '1'.repeat(41) }))).toMatch(/máximo 40/)
    expect(validateContactForm(values({ email: 'no-es-email' }))).toMatch(/email/)
    expect(validateContactForm(values({ zone: null }))).toBe('Elige tu país.')
    const week = emptyWeek().map((d) => (d.day === 1 ? { ...d, enabled: true, slots: [{ start: '10:00', end: '09:00' }] } : d))
    expect(validateContactForm(values({ hasAvailability: true, availability: week }))).toMatch(/^Disponibilidad:/)
  })

  it('envía solo los campos permitidos, sin espacios sobrantes', () => {
    const payload = contactFormPayload(values({ name: '  Ana  ', notes: 'no', groupIds: ['g1'], id: 'x' }))
    expect(Object.keys(payload).sort()).toEqual(
      ['availability', 'country', 'email', 'name', 'organization', 'phone', 'role', 'timeZone'].sort(),
    )
    expect(payload.name).toBe('Ana')
    expect(payload.availability).toBe(null)
  })

  it('llama a las funciones de Supabase con la clave pública, sin tocar tablas', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ name: 'Ana' }) }))
    const config = { url: 'https://x.supabase.co', anonKey: 'anon', fetchImpl }
    expect(await loadContactForm(TOKEN, config)).toEqual({ name: 'Ana' })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://x.supabase.co/rest/v1/rpc/cesi_contact_form_get')
    expect(init.headers.apikey).toBe('anon')
    expect(JSON.parse(init.body)).toEqual({ p_token: TOKEN })

    await saveContactForm(TOKEN, { name: 'Ana' }, config)
    expect(fetchImpl.mock.calls[1][0]).toBe('https://x.supabase.co/rest/v1/rpc/cesi_contact_form_save')
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ p_token: TOKEN, p_fields: { name: 'Ana' } })
  })

  it('traduce los errores del servidor', async () => {
    const failing = (message) => ({
      url: 'https://x.supabase.co',
      anonKey: 'anon',
      fetchImpl: async () => ({ ok: false, json: async () => ({ message }) }),
    })
    await expect(saveContactForm(TOKEN, {}, failing('invalid_link'))).rejects.toMatchObject({
      code: 'invalid_link',
      message: 'Este enlace ya no es válido.',
    })
    await expect(saveContactForm(TOKEN, {}, failing('invalid_data'))).rejects.toMatchObject({ code: 'invalid_data' })
    const offline = { url: 'u', anonKey: 'k', fetchImpl: async () => Promise.reject(new TypeError('Failed to fetch')) }
    await expect(loadContactForm(TOKEN, offline)).rejects.toMatchObject({ code: 'network' })
  })
})

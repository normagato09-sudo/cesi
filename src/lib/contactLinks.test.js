import { describe, expect, it, vi } from 'vitest'
import { contactLinkMessage, contactLinkUrl, newLinkToken } from './contactLinks'

describe('enlace para que un contacto rellene sus datos', () => {
  it('el token son 32 bytes aleatorios en base64url (43 caracteres, válido en una URL)', () => {
    const a = newLinkToken()
    const b = newLinkToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a).not.toBe(b)
  })

  it('usa el generador criptográfico', () => {
    const fake = { getRandomValues: (bytes) => bytes.fill(255) }
    expect(newLinkToken(fake)).toBe('_'.repeat(42) + '8')
  })

  it('arma la dirección /ficha/<token> en el dominio de la app', () => {
    expect(contactLinkUrl('abc', 'https://cesi.example.com')).toBe('https://cesi.example.com/ficha/abc')
  })

  it('acepta la dirección pública con barra final', () => {
    expect(contactLinkUrl('abc', 'https://cesi.example.com/')).toBe('https://cesi.example.com/ficha/abc')
  })

  it('el mensaje saluda por el nombre e incluye el enlace', () => {
    const url = 'https://cesi.example.com/ficha/abc'
    expect(contactLinkMessage({ name: 'Ana López' }, url)).toBe(
      `Hola Ana, ¿puedes revisar y completar tus datos de contacto en este enlace? ${url}`,
    )
    expect(contactLinkMessage({ name: '' }, url)).toMatch(/^Hola, /)
  })
})

// Cliente de Supabase simulado: apunta cada llamada encadenada.
function fakeSupabase(result = { data: [], error: null }) {
  const calls = []
  const chain = new Proxy(
    {},
    {
      get(_, method) {
        if (method === 'then') return (resolve) => resolve(result)
        return (...args) => {
          calls.push([method, ...args])
          return chain
        }
      },
    },
  )
  return { calls, client: { from: (table) => (calls.push(['from', table]), chain) } }
}

describe('enlaces guardados en Supabase', () => {
  it('crear uno nuevo desactiva antes los anteriores del contacto y caduca en los días elegidos', async () => {
    vi.resetModules()
    const fake = fakeSupabase({ data: { token: 't', expires_at: '2026-10-27T10:00:00.000Z' }, error: null })
    vi.doMock('./sync/client', () => ({ getSupabase: async () => fake.client }))
    const { createLink } = await import('./contactLinks')

    await createLink('c1', 30, new Date('2026-09-27T10:00:00.000Z'))
    const methods = fake.calls.map((c) => c[0])
    expect(methods.indexOf('update')).toBeLessThan(methods.indexOf('insert'))
    expect(fake.calls).toContainEqual(['update', { revoked: true }])
    expect(fake.calls).toContainEqual(['eq', 'contact_id', 'c1'])
    const inserted = fake.calls.find((c) => c[0] === 'insert')[1]
    expect(inserted.contact_id).toBe('c1')
    expect(inserted.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(inserted.expires_at).toBe('2026-10-27T10:00:00.000Z')
    expect(inserted).not.toHaveProperty('user_id') // lo pone Supabase (auth.uid())
    vi.doUnmock('./sync/client')
  })

  it('sin la tabla en Supabase explica qué falta', async () => {
    vi.resetModules()
    const fake = fakeSupabase({ data: null, error: { code: 'PGRST205', message: 'not found' } })
    vi.doMock('./sync/client', () => ({ getSupabase: async () => fake.client }))
    const { getActiveLink } = await import('./contactLinks')
    await expect(getActiveLink('c1')).rejects.toThrow(/schema\.sql/)
    vi.doUnmock('./sync/client')
  })
})

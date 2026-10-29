import { describe, expect, it } from 'vitest'
import {
  canChangeRole,
  fetchOwnRole,
  filterLinkOptions,
  linkOptions,
  linkPatch,
  linkedOption,
  normalizeDisplayName,
  providerText,
  resolveRole,
} from './profiles'

function fakeClient(result) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => (result instanceof Error ? Promise.reject(result) : result),
  }
  return { from: () => query }
}

describe('fetchOwnRole', () => {
  it('devuelve el papel de la cuenta', async () => {
    expect(await fetchOwnRole(fakeClient({ data: { role: 'ceo' }, error: null }), 'u1')).toEqual({ status: 'ok', role: 'ceo' })
  })

  it('sin perfil o con un papel desconocido, pendiente', async () => {
    expect(await fetchOwnRole(fakeClient({ data: null, error: null }), 'u1')).toEqual({ status: 'ok', role: 'pendiente' })
    expect(await fetchOwnRole(fakeClient({ data: { role: 'admin' }, error: null }), 'u1')).toEqual({ status: 'ok', role: 'pendiente' })
  })

  it('sin la tabla profiles, la app de siempre', async () => {
    expect(await fetchOwnRole(fakeClient({ data: null, error: { code: 'PGRST205' } }), 'u1')).toEqual({ status: 'legacy' })
  })

  it('sin conexión, error', async () => {
    expect((await fetchOwnRole(fakeClient(new Error('Failed to fetch')), 'u1')).status).toBe('error')
    expect((await fetchOwnRole(fakeClient({ data: null, error: { message: 'x' } }), 'u1')).status).toBe('error')
  })
})

describe('resolveRole', () => {
  it('manda el servidor; sin tabla, ceo; si no se pudo comprobar, el último conocido', () => {
    expect(resolveRole({ status: 'ok', role: 'pendiente' }, 'ceo')).toBe('pendiente')
    expect(resolveRole({ status: 'legacy' }, null)).toBe('ceo')
    expect(resolveRole({ status: 'error' }, 'ceo')).toBe('ceo')
    expect(resolveRole({ status: 'error' }, null)).toBeNull()
    expect(resolveRole(undefined, null)).toBeNull()
  })
})

describe('providerText', () => {
  it('dice con qué se registró la cuenta y su usuario de Discord', () => {
    expect(providerText({ auth_provider: 'google' })).toBe('Google')
    expect(providerText({ auth_provider: 'email' })).toBe('Correo')
    expect(providerText({ auth_provider: 'discord', discord_username: 'ana_cifa' })).toBe('Discord · @ana_cifa')
    expect(providerText({ auth_provider: 'discord', discord_username: null })).toBe('Discord')
    expect(providerText({ auth_provider: '' })).toBeNull()
    expect(providerText({})).toBeNull()
  })
})

describe('normalizeDisplayName', () => {
  it('quita espacios de más y corta a 120 caracteres', () => {
    expect(normalizeDisplayName('  Ana   García ')).toBe('Ana García')
    expect(normalizeDisplayName(null)).toBe('')
    expect(normalizeDisplayName('a'.repeat(200))).toHaveLength(120)
  })
})

describe('canChangeRole', () => {
  it('la ceo no puede cambiarse su propio papel', () => {
    expect(canChangeRole({ id: 'yo' }, 'yo')).toBe(false)
    expect(canChangeRole({ id: 'otra' }, 'yo')).toBe(true)
  })
})

describe('enlaces', () => {
  const contacts = [
    { id: 'c1', name: 'Zoe', teamProfile: { status: 'active' } },
    { id: 'c2', name: 'Ana', teamProfile: { status: 'former' } },
    { id: 'c3', name: 'Sin equipo' },
  ]
  const students = [{ id: 's1', name: 'Íñigo' }]
  const options = linkOptions(contacts, students)

  it('lista el Equipo (también antiguos) y los alumnos', () => {
    expect(options.map((o) => [o.kind, o.id])).toEqual([
      ['team', 'c2'],
      ['team', 'c1'],
      ['student', 's1'],
    ])
    expect(options[0].detail).toBe('Equipo · antiguo miembro')
  })

  it('busca sin acentos ni mayúsculas', () => {
    expect(filterLinkOptions(options, 'inigo').map((o) => o.id)).toEqual(['s1'])
    expect(filterLinkOptions(options, '')).toHaveLength(3)
  })

  it('une a una sola persona a la vez', () => {
    expect(linkPatch(options[2])).toEqual({ linked_team_id: null, linked_student_id: 's1' })
    expect(linkPatch(options[1])).toEqual({ linked_team_id: 'c1', linked_student_id: null })
    expect(linkPatch(null)).toEqual({ linked_team_id: null, linked_student_id: null })
  })

  it('sin nombre, la cuenta toma el de la persona a la que se une', () => {
    expect(linkPatch(options[2], { display_name: '  ' })).toEqual({ linked_team_id: null, linked_student_id: 's1', display_name: 'Íñigo' })
    expect(linkPatch(options[2], { display_name: 'Ya tiene' })).toEqual({ linked_team_id: null, linked_student_id: 's1' })
    expect(linkPatch(null, { display_name: '' })).toEqual({ linked_team_id: null, linked_student_id: null })
    expect(linkPatch({ kind: 'team', id: 'x', missing: true }, { display_name: '' })).not.toHaveProperty('display_name')
  })

  it('encuentra la persona unida o avisa si ya no existe', () => {
    expect(linkedOption({ linked_student_id: 's1' }, options).label).toBe('Íñigo')
    expect(linkedOption({ linked_team_id: 'borrado' }, options)).toEqual({ kind: 'team', id: 'borrado', missing: true })
    expect(linkedOption({}, options)).toBeNull()
  })
})

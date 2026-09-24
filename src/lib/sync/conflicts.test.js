import { describe, expect, it } from 'vitest'
import { planInitialSync, shouldApplyRemote } from './conflicts'
import { docHash, stableStringify } from './hash'

const T = (s) => `2026-09-24T10:00:${String(s).padStart(2, '0')}.000Z`
const ms = (s) => Date.parse(T(s))

describe('resolución de conflictos (gana el updated_at más reciente)', () => {
  it('aplica la versión de la nube si es más nueva que lo que tiene el dispositivo', () => {
    expect(shouldApplyRemote({ pending: null, known: { stamp: ms(1) }, remote: { updated_at: T(2) } })).toBe(true)
    expect(shouldApplyRemote({ pending: null, known: null, remote: { updated_at: T(2) } })).toBe(true)
  })

  it('ignora versiones antiguas y el eco de su propio envío', () => {
    expect(shouldApplyRemote({ pending: null, known: { stamp: ms(3) }, remote: { updated_at: T(2) } })).toBe(false)
    expect(shouldApplyRemote({ pending: null, known: { stamp: ms(2) }, remote: { updated_at: T(2) } })).toBe(false)
  })

  it('un cambio local pendiente más reciente gana; uno más antiguo pierde', () => {
    expect(shouldApplyRemote({ pending: { updatedAt: T(5) }, known: { stamp: ms(5) }, remote: { updated_at: T(4) } })).toBe(false)
    expect(shouldApplyRemote({ pending: { updatedAt: T(3) }, known: { stamp: ms(3) }, remote: { updated_at: T(4) } })).toBe(true)
  })

  it('las huellas no dependen del orden de las claves (jsonb las reordena)', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: [1, { f: 1, e: 2 }] } })).toBe('{"a":{"c":[1,{"e":2,"f":1}],"d":2},"b":1}')
    expect(docHash({ title: 'x', notes: 'y' })).toBe(docHash({ notes: 'y', title: 'x' }))
    expect(docHash({ title: 'x' })).not.toBe(docHash({ title: 'y' }))
  })
})

describe('primer inicio de sesión con datos en los dos sitios', () => {
  const local = new Map([
    ['solo-aqui', { id: 'solo-aqui', updatedAt: T(1) }],
    ['en-los-dos-nuevo-aqui', { id: 'en-los-dos-nuevo-aqui', title: 'aquí', updatedAt: T(9) }],
    ['en-los-dos-nuevo-alli', { id: 'en-los-dos-nuevo-alli', title: 'aquí', updatedAt: T(1) }],
  ])
  const remote = [
    { id: 'solo-alli', data: { id: 'solo-alli' }, updated_at: T(2), deleted_at: null },
    { id: 'borrado-alli', data: {}, updated_at: T(2), deleted_at: T(2) },
    { id: 'en-los-dos-nuevo-aqui', data: { title: 'nube' }, updated_at: T(5), deleted_at: null },
    { id: 'en-los-dos-nuevo-alli', data: { title: 'nube' }, updated_at: T(5), deleted_at: null },
  ]
  const now = ms(30)

  it('conservar los de la nube', () => {
    const plan = planInitialSync('cloud', local, remote, now)
    expect([...plan.local.keys()].sort()).toEqual(['en-los-dos-nuevo-alli', 'en-los-dos-nuevo-aqui', 'solo-alli'])
    expect(plan.local.get('en-los-dos-nuevo-aqui').title).toBe('nube')
    expect(plan.upload).toEqual([])
  })

  it('conservar los de este dispositivo (lo que solo está en la nube se borra)', () => {
    const plan = planInitialSync('device', local, remote, now)
    expect([...plan.local.keys()].sort()).toEqual(['en-los-dos-nuevo-alli', 'en-los-dos-nuevo-aqui', 'solo-aqui'])
    expect(plan.upload.map((u) => [u.id, u.deleted]).sort()).toEqual([
      ['en-los-dos-nuevo-alli', false],
      ['en-los-dos-nuevo-aqui', false],
      ['solo-alli', true],
      ['solo-aqui', false],
    ])
    expect(plan.upload.every((u) => u.stamp === now)).toBe(true)
  })

  it('fusionar por id: unión y, si está en los dos, el más reciente', () => {
    const plan = planInitialSync('merge', local, remote, now)
    expect([...plan.local.keys()].sort()).toEqual(['en-los-dos-nuevo-alli', 'en-los-dos-nuevo-aqui', 'solo-alli', 'solo-aqui'])
    expect(plan.local.get('en-los-dos-nuevo-aqui').title).toBe('aquí')
    expect(plan.local.get('en-los-dos-nuevo-alli').title).toBe('nube')
    expect(plan.upload.map((u) => u.id).sort()).toEqual(['en-los-dos-nuevo-aqui', 'solo-aqui'])
  })
})

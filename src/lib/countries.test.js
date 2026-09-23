import { describe, expect, it } from 'vitest'
import { COUNTRIES } from './countries'

describe('lista de países', () => {
  it('tiene los 195 países (193 de la ONU + Vaticano y Palestina)', () => {
    expect(COUNTRIES).toHaveLength(195)
    const codes = COUNTRIES.map((c) => c.code)
    expect(codes).toContain('VA')
    expect(codes).toContain('PS')
    expect(codes).not.toContain('XK')
    expect(codes).not.toContain('TW')
  })

  it('no repite códigos y usa ISO 3166-1 alfa-2', () => {
    const codes = COUNTRIES.map((c) => c.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const code of codes) expect(code).toMatch(/^[A-Z]{2}$/)
  })

  it('todas las zonas son válidas en Intl.DateTimeFormat', () => {
    for (const country of COUNTRIES) {
      expect(country.zones.length).toBeGreaterThan(0)
      for (const zone of country.zones) {
        expect(() => new Intl.DateTimeFormat('es', { timeZone: zone.id })).not.toThrow()
      }
    }
  })

  it('está ordenada alfabéticamente en español', () => {
    const names = COUNTRIES.map((c) => c.name)
    expect([...names].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))).toEqual(names)
  })

  it('España tiene península (predeterminada) y Canarias', () => {
    const spain = COUNTRIES.find((c) => c.code === 'ES')
    expect(spain.zones.map((z) => [z.id, z.label])).toEqual([
      ['Europe/Madrid', 'España (península y Baleares)'],
      ['Atlantic/Canary', 'España (Canarias)'],
    ])
  })

  it('los países con varias zonas las nombran por ciudad en español', () => {
    const us = COUNTRIES.find((c) => c.code === 'US')
    expect(us.zones[0].label).toBe('Estados Unidos: Nueva York')
    expect(us.zones.map((z) => z.label)).toContain('Estados Unidos: Los Ángeles')
    const mx = COUNTRIES.find((c) => c.code === 'MX')
    expect(mx.zones[0]).toMatchObject({ id: 'America/Mexico_City', place: 'Ciudad de México' })
    for (const code of ['CA', 'BR', 'RU', 'AU', 'ID', 'AR', 'KZ']) {
      expect(COUNTRIES.find((c) => c.code === code).zones.length).toBeGreaterThan(1)
    }
  })
})

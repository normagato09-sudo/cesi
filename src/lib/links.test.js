import { beforeEach, describe, expect, it } from 'vitest'
import { cleanLinks, legacySocialUrl, linkDomain, linkSite, linkTitle, migrateProfileLinks, normalizeUrl, validateUrl } from './links'
import { getAllContacts } from './contacts'
import { removeFromTeamPatch } from './team'

beforeEach(() => localStorage.clear())

describe('validación de URLs', () => {
  it('añade https:// si falta', () => {
    expect(normalizeUrl('instagram.com/ana')).toBe('https://instagram.com/ana')
    expect(normalizeUrl('  https://cesi.es ')).toBe('https://cesi.es')
    expect(normalizeUrl('http://radio.local.es')).toBe('http://radio.local.es')
    expect(normalizeUrl('')).toBe('')
  })

  it('acepta direcciones web normales', () => {
    for (const url of ['instagram.com/ana', 'https://www.linkedin.com/in/ana-lopez', 'youtu.be/abc', 'ana.dev', 'https://discord.gg/cesi', 'x.com/ana?s=1']) {
      expect(validateUrl(url)).toBeNull()
    }
  })

  it('rechaza lo que no es una dirección, con un mensaje claro', () => {
    expect(validateUrl('')).toBe('Pega la dirección del enlace.')
    expect(validateUrl('no es una url')).toMatch(/«no es una url» no es una dirección válida/)
    for (const url of ['ana', '@ana', 'ftp://cesi.es', 'https://', 'cesi.', 'javascript:alert(1)', 'https://cesi..es']) {
      expect(validateUrl(url)).toMatch(/no es una dirección válida/)
    }
  })

  it('reconoce las redes conocidas y, si no, usa el dominio', () => {
    expect(linkSite('https://www.instagram.com/ana').name).toBe('Instagram')
    expect(linkSite('twitter.com/ana').name).toBe('X')
    expect(linkSite('m.youtube.com/@ana').name).toBe('YouTube')
    expect(linkSite('twitch.tv/ana').name).toBe('Twitch')
    expect(linkSite('discord.gg/cesi').name).toBe('Discord')
    expect(linkSite('ana.dev')).toBeNull()
    expect(linkDomain('https://www.instagram.com/ana')).toBe('instagram.com')
    expect(linkTitle({ label: '', url: 'https://www.instagram.com/ana' })).toBe('instagram.com')
    expect(linkTitle({ label: 'Mi canal', url: 'youtube.com/@ana' })).toBe('Mi canal')
  })

  it('al guardar quita los vacíos y los repetidos', () => {
    const list = cleanLinks([
      { id: 'a', label: ' Web ', url: 'ana.dev' },
      { id: 'b', label: '', url: '   ' },
      { id: 'c', label: '', url: 'https://ana.dev/' },
    ])
    expect(list).toEqual([{ id: 'a', label: 'Web', url: 'https://ana.dev' }])
  })
})

describe('migración de redes y enlaces', () => {
  it('las redes separadas pasan a la lista, detrás de los enlaces que ya había, sin perder nada', () => {
    const profile = {
      role: 'Locutora',
      social: { instagram: '@ana.voz', linkedin: 'https://www.linkedin.com/in/ana', tiktok: 'ana', youtube: '', web: 'ana.dev' },
      links: [{ id: 'l1', label: 'Portfolio', url: 'behance.net/ana' }],
    }
    const migrated = migrateProfileLinks(profile)
    expect(migrated).not.toHaveProperty('social')
    expect(migrated.role).toBe('Locutora')
    expect(migrated.links.map((l) => [l.label, l.url])).toEqual([
      ['Portfolio', 'https://behance.net/ana'],
      ['', 'https://instagram.com/ana.voz'],
      ['', 'https://www.linkedin.com/in/ana'],
      ['', 'https://www.tiktok.com/@ana'],
      ['', 'https://ana.dev'],
    ])
    // Ya migrado: no cambia.
    expect(migrateProfileLinks(migrated)).toBe(migrated)
  })

  it('arma las direcciones antiguas a partir del usuario', () => {
    expect(legacySocialUrl('youtube', '@canal')).toBe('https://www.youtube.com/@canal')
    expect(legacySocialUrl('web', 'cesi.es')).toBe('https://cesi.es')
  })

  it('se aplica al leer los contactos (también de la nube o de una copia antigua)', () => {
    localStorage.setItem(
      'cesi_contacts_v1',
      JSON.stringify([
        { id: 'a', name: 'Ana', country: 'ES', timeZone: 'Europe/Madrid', teamProfile: { role: 'x', social: { instagram: 'ana' }, links: [] } },
      ]),
    )
    const [ana] = getAllContacts()
    expect(ana.teamProfile.links.map((l) => l.url)).toEqual(['https://instagram.com/ana'])
    expect(JSON.parse(localStorage.getItem('cesi_contacts_v1'))[0].teamProfile).not.toHaveProperty('social')
  })

  it('al quitar a alguien del equipo sus enlaces (y redes antiguas) quedan en el contacto', () => {
    const patch = removeFromTeamPatch({ id: 'a', links: [], teamProfile: { social: { instagram: '@ana' }, links: [{ id: 'l', label: '', url: 'ana.dev' }] } })
    expect(patch.links.map((l) => l.url)).toEqual(['https://ana.dev', 'https://instagram.com/ana'])
  })
})

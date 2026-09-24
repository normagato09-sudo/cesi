import { makeId } from './store'

// Enlaces del perfil de equipo: una sola lista [{ id, label, url }]. El nombre es opcional: sin
// nombre se muestra el dominio. Las redes conocidas se reconocen por el dominio.

export const KNOWN_SITES = [
  { name: 'Instagram', color: '#c13584', hosts: ['instagram.com', 'instagr.am'] },
  { name: 'LinkedIn', color: '#0a66c2', hosts: ['linkedin.com', 'lnkd.in'] },
  { name: 'TikTok', color: '#111827', hosts: ['tiktok.com'] },
  { name: 'YouTube', color: '#dc2626', hosts: ['youtube.com', 'youtu.be'] },
  { name: 'X', color: '#111827', hosts: ['x.com', 'twitter.com'] },
  { name: 'Twitch', color: '#7c3aed', hosts: ['twitch.tv'] },
  { name: 'Discord', color: '#5865f2', hosts: ['discord.com', 'discord.gg', 'discordapp.com'] },
  { name: 'Facebook', color: '#1877f2', hosts: ['facebook.com', 'fb.com'] },
  { name: 'GitHub', color: '#111827', hosts: ['github.com'] },
  { name: 'Spotify', color: '#16a34a', hosts: ['spotify.com'] },
  { name: 'Telegram', color: '#0284c7', hosts: ['t.me', 'telegram.me'] },
  { name: 'WhatsApp', color: '#16a34a', hosts: ['wa.me', 'whatsapp.com'] },
  { name: 'Kick', color: '#15803d', hosts: ['kick.com'] },
  { name: 'Threads', color: '#111827', hosts: ['threads.net'] },
  { name: 'Behance', color: '#1769ff', hosts: ['behance.net'] },
]

// Direcciones de las redes del formato antiguo, a partir del usuario ("@ana") o de una dirección.
const LEGACY_SOCIAL_BASE = {
  instagram: 'https://instagram.com/',
  linkedin: 'https://www.linkedin.com/in/',
  tiktok: 'https://www.tiktok.com/@',
  youtube: 'https://www.youtube.com/@',
  web: 'https://',
}

// Añade "https://" si falta. No valida.
export function normalizeUrl(value) {
  const v = (value || '').trim()
  if (!v) return ''
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v) || /^(mailto|tel):/i.test(v)) return v
  return `https://${v.replace(/^\/+/, '')}`
}

// Mensaje de error si no es una dirección web válida, o null.
export function validateUrl(value) {
  const raw = (value || '').trim()
  if (!raw) return 'Pega la dirección del enlace.'
  const invalid = `«${raw}» no es una dirección válida. Pega la dirección completa, por ejemplo instagram.com/usuario.`
  if (/\s/.test(raw)) return invalid
  let url
  try {
    url = new URL(normalizeUrl(raw))
  } catch {
    return invalid
  }
  if (!['http:', 'https:'].includes(url.protocol)) return invalid
  const host = url.hostname
  if (!host || !(host === 'localhost' || /^[^.]+(\.[^.]+)+$/.test(host)) || /\.$|^\.|\.\./.test(host)) return invalid
  if (!/\.[a-z]{2,}$/i.test(host) && !/^\d+\.\d+\.\d+\.\d+$/.test(host) && host !== 'localhost') return invalid
  return null
}

// "instagram.com" (sin "www.")
export function linkDomain(value) {
  try {
    return new URL(normalizeUrl(value)).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return (value || '').trim()
  }
}

// Red conocida del enlace ({ name, color }) o null.
export function linkSite(value) {
  const domain = linkDomain(value)
  return KNOWN_SITES.find((site) => site.hosts.some((h) => domain === h || domain.endsWith(`.${h}`))) || null
}

// Texto del enlace: su nombre o, si no tiene, el dominio.
export function linkTitle(link) {
  return (link.label || '').trim() || linkDomain(link.url)
}

export function newLink(url = '', label = '') {
  return { id: makeId('link'), label, url }
}

// Enlace de una red del formato antiguo (usuario o dirección).
export function legacySocialUrl(key, value) {
  const v = (value || '').trim()
  if (!v) return ''
  if (/^https?:\/\//i.test(v)) return v
  if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(v)) return `https://${v}`
  return `${LEGACY_SOCIAL_BASE[key] || 'https://'}${v.replace(/^@/, '')}`
}

// Limpia la lista antes de guardarla: quita los vacíos, añade "https://" y quita repetidos.
export function cleanLinks(links) {
  const seen = new Set()
  const out = []
  for (const link of links || []) {
    const url = normalizeUrl(link.url)
    if (!url) continue
    const key = url.toLowerCase().replace(/\/+$/, '')
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ id: link.id || makeId('link'), label: (link.label || '').trim(), url })
  }
  return out
}

/**
 * Migración del formato antiguo del perfil de equipo: las redes separadas (`social`: Instagram,
 * LinkedIn, TikTok, YouTube, web) pasan a la lista de enlaces, detrás de los enlaces que ya había,
 * sin perder nada. Devuelve el mismo perfil si no hay nada que cambiar.
 */
export function migrateProfileLinks(profile) {
  if (!profile || !('social' in profile)) return profile
  const { social, ...rest } = profile
  const fromSocial = Object.entries(social || {})
    .filter(([, value]) => value && String(value).trim())
    .map(([key, value]) => ({ id: makeId('link'), label: '', url: legacySocialUrl(key, String(value)) }))
  return { ...rest, links: cleanLinks([...(profile.links || []), ...fromSocial]) }
}

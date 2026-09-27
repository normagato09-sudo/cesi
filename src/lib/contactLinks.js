import { getSupabase } from './sync/client'

// Enlace para que un contacto rellene y edite sus datos en la página pública /ficha/<token>
// (tabla contact_links de Supabase). Solo funciona con la sincronización activa: la página lee y
// guarda el contacto en la nube, con las funciones cesi_contact_form_get y cesi_contact_form_save.

export const DEFAULT_LINK_DAYS = 30
export const LINK_DAYS_OPTIONS = [7, 30, 90]

// 32 bytes aleatorios en base64url (43 caracteres).
export function newLinkToken(cryptoImpl = globalThis.crypto) {
  const bytes = new Uint8Array(32)
  cryptoImpl.getRandomValues(bytes)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function contactLinkUrl(token, origin = globalThis.location?.origin || '') {
  return `${origin}/ficha/${token}`
}

// Mensaje para enviar por WhatsApp o email.
export function contactLinkMessage(contact, url) {
  const firstName = (contact.name || '').trim().split(/\s+/)[0]
  return `Hola${firstName ? ` ${firstName}` : ''}, ¿puedes revisar y completar tus datos de contacto en este enlace? ${url}`
}

async function client() {
  const supabase = await getSupabase()
  if (!supabase) throw new Error('Para enviar el enlace hace falta la sincronización con Supabase.')
  return supabase
}

function check({ data, error }) {
  if (!error) return data
  // La tabla aún no existe: falta ejecutar la versión nueva de supabase/schema.sql.
  if (error.code === '42P01' || error.code === 'PGRST205') {
    throw new Error('Falta preparar Supabase: ejecuta otra vez supabase/schema.sql en el SQL Editor.')
  }
  throw new Error(error.message || 'No se pudo conectar con Supabase.')
}

// Enlace activo (sin desactivar ni caducar) de un contacto, o null.
export async function getActiveLink(contactId) {
  const supabase = await client()
  const rows = check(
    await supabase
      .from('contact_links')
      .select('token, created_at, expires_at')
      .eq('contact_id', contactId)
      .eq('revoked', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1),
  )
  return rows?.[0] || null
}

// Desactiva todos los enlaces de un contacto.
export async function revokeLinks(contactId) {
  const supabase = await client()
  check(await supabase.from('contact_links').update({ revoked: true }).eq('contact_id', contactId).eq('revoked', false))
}

// Crea un enlace nuevo (el anterior deja de valer) que caduca en `days` días.
export async function createLink(contactId, days = DEFAULT_LINK_DAYS, now = new Date()) {
  await revokeLinks(contactId)
  const supabase = await client()
  const row = {
    token: newLinkToken(),
    contact_id: contactId,
    expires_at: new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString(),
  }
  return check(await supabase.from('contact_links').insert(row).select('token, created_at, expires_at').single())
}

import { isEmail, validateContactCountry } from './contacts'
import { cleanWeek, validateWeek } from './weeklySchedule'

// Formulario público /ficha/<token>: la persona rellena sus propios datos. No usa el cliente de
// Supabase ni toca tablas: solo llama por HTTP a las funciones cesi_contact_form_get y
// cesi_contact_form_save (supabase/schema.sql), que validan el token y la lista blanca de campos.

// Longitud máxima de cada texto (la misma que comprueba el servidor).
export const FIELD_LIMITS = { name: 120, email: 200, phone: 40, organization: 120, role: 120 }

const TOKEN_RE = /^\/ficha\/([A-Za-z0-9_-]{32,100})\/?$/

export function tokenFromPath(pathname) {
  return TOKEN_RE.exec(pathname || '')?.[1] || null
}

// Mensaje de error o null. `values`: { name, email, phone, organization, role, zone, hasAvailability, availability }.
export function validateContactForm(values) {
  if (!values.name.trim()) return 'Escribe tu nombre.'
  for (const [field, max] of Object.entries(FIELD_LIMITS)) {
    if (values[field].trim().length > max) return `Es demasiado largo (máximo ${max} caracteres).`
  }
  if (values.email.trim() && !isEmail(values.email)) return 'El email no tiene un formato válido.'
  const countryProblem = validateContactCountry(values.zone || {})
  if (countryProblem) return countryProblem.replace('El país es obligatorio.', 'Elige tu país.')
  if (values.hasAvailability) {
    const problem = validateWeek(values.availability)
    if (problem) return `Disponibilidad: ${problem}`
  }
  return null
}

// Solo los campos que la persona puede cambiar.
export function contactFormPayload(values) {
  return {
    name: values.name.trim(),
    email: values.email.trim(),
    phone: values.phone.trim(),
    organization: values.organization.trim(),
    role: values.role.trim(),
    country: values.zone.country,
    timeZone: values.zone.timeZone,
    availability: values.hasAvailability ? cleanWeek(values.availability) : null,
  }
}

const ERROR_TEXT = {
  invalid_link: 'Este enlace ya no es válido.',
  name_required: 'Escribe tu nombre.',
  invalid_email: 'El email no tiene un formato válido.',
  invalid_zone: 'Elige tu país y tu zona horaria.',
  invalid_availability: 'Revisa las franjas de disponibilidad.',
  invalid_data: 'Algún dato no es válido o es demasiado largo.',
}

export class ContactFormError extends Error {
  constructor(code) {
    super(ERROR_TEXT[code] || 'No se pudo guardar. Inténtalo de nuevo.')
    this.code = code
  }
}

// Llama a una función de Supabase con la clave pública (anon), que no da acceso a ninguna tabla.
async function rpc(name, args, { url, anonKey, fetchImpl = globalThis.fetch }) {
  if (!url || !anonKey) throw new ContactFormError('unavailable')
  let res
  try {
    res = await fetchImpl(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    })
  } catch {
    throw new ContactFormError('network')
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const code = Object.keys(ERROR_TEXT).find((c) => (body?.message || '').includes(c))
    throw new ContactFormError(code || 'server')
  }
  return body
}

// Datos actuales del contacto, o null si el enlace no existe, está desactivado o ha caducado.
export function loadContactForm(token, config) {
  return rpc('cesi_contact_form_get', { p_token: token }, config)
}

export function saveContactForm(token, payload, config) {
  return rpc('cesi_contact_form_save', { p_token: token, p_fields: payload }, config)
}

import { isEmail, validateContactCountry } from './contacts'
import { cleanWeek, validateWeek } from './weeklySchedule'
import { callPublicRpc } from './publicRpc'

// Formulario público /ficha/<token>: la persona rellena sus propios datos. No usa el cliente de
// Supabase ni toca tablas: solo llama por HTTP a las funciones cesi_contact_form_get y
// cesi_contact_form_save (supabase/schema.sql), que validan el token y la lista blanca de campos.

// La persona solo rellena nombre, email, país y zona, y disponibilidad. El teléfono, la
// organización y el cargo no salen en la página: se rellenan desde la app y no se tocan al guardar.

// Longitud máxima de cada texto (la misma que comprueba el servidor).
export const FIELD_LIMITS = { name: 120, email: 200 }

const TOKEN_RE = /^\/ficha\/([A-Za-z0-9_-]{32,100})\/?$/

export function tokenFromPath(pathname) {
  return TOKEN_RE.exec(pathname || '')?.[1] || null
}

// ¿Algún día con al menos una franja?
export function hasAnySlot(week) {
  return week.some((entry) => entry.enabled && entry.slots.length > 0)
}

// Mensaje de error o null. `values`: { name, email, zone, availability }.
export function validateContactForm(values) {
  if (!values.name.trim()) return 'Escribe tu nombre.'
  for (const [field, max] of Object.entries(FIELD_LIMITS)) {
    if (values[field].trim().length > max) return `Es demasiado largo (máximo ${max} caracteres).`
  }
  if (values.email.trim() && !isEmail(values.email)) return 'El email no tiene un formato válido.'
  const countryProblem = validateContactCountry(values.zone || {})
  if (countryProblem) return countryProblem.replace('El país es obligatorio.', 'Elige tu país.')
  const weekProblem = validateWeek(values.availability)
  if (weekProblem) return `Disponibilidad: ${weekProblem}`
  if (!hasAnySlot(values.availability)) return 'Indica al menos un día y una franja en la que puedas reunirte.'
  return null
}

// Solo los campos que la persona puede cambiar.
export function contactFormPayload(values) {
  return {
    name: values.name.trim(),
    email: values.email.trim(),
    country: values.zone.country,
    timeZone: values.zone.timeZone,
    availability: cleanWeek(values.availability),
  }
}

const ERROR_TEXT = {
  invalid_link: 'Este enlace ya no es válido.',
  name_required: 'Escribe tu nombre.',
  invalid_email: 'El email no tiene un formato válido.',
  invalid_zone: 'Elige tu país y tu zona horaria.',
  invalid_availability: 'Revisa tu disponibilidad: indica al menos un día y una franja.',
  invalid_data: 'Algún dato no es válido o es demasiado largo.',
}

export class ContactFormError extends Error {
  constructor(code) {
    super(ERROR_TEXT[code] || 'No se pudo guardar. Inténtalo de nuevo.')
    this.code = code
  }
}

function rpc(name, args, config) {
  return callPublicRpc(name, args, config, { codes: Object.keys(ERROR_TEXT), makeError: (code) => new ContactFormError(code) })
}

// Datos actuales del contacto, o null si el enlace no existe, está desactivado o ha caducado.
export function loadContactForm(token, config) {
  return rpc('cesi_contact_form_get', { p_token: token }, config)
}

export function saveContactForm(token, payload, config) {
  return rpc('cesi_contact_form_save', { p_token: token, p_fields: payload }, config)
}

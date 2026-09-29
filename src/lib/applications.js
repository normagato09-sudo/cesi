import { candidaciesOf, candidacyPatch, isCandidateOnly } from './vacancies'

// Candidaturas nuevas y personas que ya conocemos.
//
// Una candidatura se enlaza al contacto elegido o, si no se elige ninguno, al que ya tenga ese
// email (sin distinguir mayúsculas ni espacios) en lugar de crear otro. Si esa persona ya se había
// presentado a la misma vacante, se actualiza esa candidatura.

export function normalizeEmail(email) {
  return (email || '').trim().toLocaleLowerCase('es')
}

// Nombre para comparar: sin mayúsculas, sin acentos y con un solo espacio entre palabras.
export function normalizeName(name) {
  return (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Contactos que podrían ser la misma persona: [{ contact, by: 'email' | 'name' }], primero los
 * que coinciden en el email (ese contacto es el que se usaría) y luego los que coinciden en el
 * nombre completo.
 */
export function findDuplicates(contacts, { name = '', email = '' } = {}) {
  const byEmail = normalizeEmail(email) ? contacts.filter((c) => normalizeEmail(c.email) === normalizeEmail(email)) : []
  const key = normalizeName(name)
  const byName = key ? contacts.filter((c) => normalizeName(c.name) === key && !byEmail.includes(c)) : []
  return [...byEmail.map((contact) => ({ contact, by: 'email' })), ...byName.map((contact) => ({ contact, by: 'name' }))]
}

// Contactos que coinciden con lo que se busca (nombre, email o teléfono), por nombre.
export function searchContacts(contacts, query) {
  const q = normalizeName(query)
  if (!q) return []
  const digits = q.replace(/\D/g, '')
  return contacts
    .filter(
      (c) =>
        normalizeName(c.name).includes(q) ||
        normalizeEmail(c.email).includes(q) ||
        (digits.length >= 3 && (c.phone || '').replace(/\D/g, '').includes(digits)),
    )
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }))
}

// Contacto con ese email, o null. Si hay varios: primero los del equipo, luego los contactos
// normales, luego los que solo son candidatos; y entre ellos, el cambiado más recientemente.
export function findContactByEmail(contacts, email) {
  const key = normalizeEmail(email)
  if (!key) return null
  const rank = (c) => (c.teamProfile ? 0 : isCandidateOnly(c) ? 2 : 1)
  const matches = contacts.filter((c) => normalizeEmail(c.email) === key)
  matches.sort((a, b) => rank(a) - rank(b) || (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  return matches[0] || null
}

// "Ya es del equipo" / "Ya es contacto" (o null si no hay nadie con ese email).
export function knownPersonText(contact) {
  if (!contact) return null
  if (contact.teamProfile) return contact.teamProfile.status === 'former' ? 'Fue del equipo' : 'Ya es del equipo'
  return isCandidateOnly(contact) ? 'Ya se había postulado' : 'Ya es contacto'
}

// Datos del contacto que se rellenan solo si el contacto existente no los tenía.
function fillBlanks(contact, data) {
  const patch = {}
  for (const [key, value] of Object.entries(data)) {
    const empty = contact[key] == null || contact[key] === '' || (Array.isArray(contact[key]) && contact[key].length === 0)
    if (empty && value != null && value !== '') patch[key] = value
  }
  // País y zona van juntos: si el del contacto estaba sin revisar, vale el que ha elegido la persona.
  if (contact.countryUnreviewed && data.country && data.timeZone) {
    Object.assign(patch, { country: data.country, timeZone: data.timeZone, countryUnreviewed: false })
  }
  return patch
}

/**
 * Candidatura nueva para `contactData` (lo que se sabe de la persona). Devuelve:
 *   { action: 'create', contact }             contacto nuevo, solo candidato;
 *   { action: 'update', id, patch, existing } enlazada al contacto elegido (`contactId`) o al que
 *                                             ya tenía ese email (sus datos solo se completan si
 *                                             le faltaban);
 * Si ya tenía una candidatura a esa vacante, se actualiza esa (con `update`) en vez de añadir otra.
 */
export function planCandidacy(contacts, contactData, candidacy, contactId = null) {
  const existing = contactId ? contacts.find((c) => c.id === contactId) || null : findContactByEmail(contacts, contactData.email)
  if (!existing) {
    return { action: 'create', contact: { ...contactData, candidateOnly: true, candidacies: [candidacy] } }
  }
  const same = candidaciesOf(existing).find((c) => c.vacancyId === candidacy.vacancyId)
  const patch = { ...fillBlanks(existing, contactData) }
  if (same) {
    // Se conservan su estado, su historial y su fecha; se actualiza lo que ha enviado ahora.
    const kept = new Set(['id', 'status', 'history', 'discardedAt', 'appliedAt'])
    const updates = Object.fromEntries(Object.entries(candidacy).filter(([k, v]) => !kept.has(k) && v != null && v !== ''))
    Object.assign(patch, candidacyPatch(existing, same.id, (c) => ({ ...c, ...updates })))
  } else {
    patch.candidacies = [...candidaciesOf(existing), candidacy]
  }
  return { action: 'update', id: existing.id, patch, existing }
}


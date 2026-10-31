import { addDaysKey, mondayOf } from './sharedCalendar'
import { migrateContacts } from './contacts'

// Alianzas (ver supabase/parte16_alianzas.sql): el seguimiento de patrocinadores y colaboraciones
// va dentro del contacto externo (contact.alliance), con mis datos:
// {
//   type: 'patrocinador' | 'colaborador' | 'partner' | 'otro',
//   status: 'por_contactar' | 'contactado' | 'negociacion' | 'cerrado' | 'descartado',
//   offer: qué ofrece o qué se acuerda, amount: € aproximados (o null),
//   startDate, endDate: el acuerdo ('AAAA-MM-DD' o ''),
//   nextStep, nextStepDate: el próximo paso y su fecha,
//   ownerId, ownerName: responsable (persona de Alianzas o Directivo),
//   notes: [{ id, at (ISO), text, byId, by }], closedAt: cuándo se cerró, updatedAt
// }
// Alianzas y yo lo editamos (yo, en mis datos; Alianzas, con las funciones de la parte 16);
// Directivo solo lo ve; las demás áreas no lo reciben.

export const ALLIANCE_TYPES = [
  { id: 'patrocinador', label: 'Patrocinador' },
  { id: 'colaborador', label: 'Colaborador' },
  { id: 'partner', label: 'Partner' },
  { id: 'otro', label: 'Otro' },
]
export const ALLIANCE_STATUSES = [
  { id: 'por_contactar', label: 'Por contactar' },
  { id: 'contactado', label: 'Contactado' },
  { id: 'negociacion', label: 'En negociación' },
  { id: 'cerrado', label: 'Cerrado (acuerdo)' },
  { id: 'descartado', label: 'Descartado' },
]
export const TYPE_LABEL = Object.fromEntries(ALLIANCE_TYPES.map((t) => [t.id, t.label]))
export const STATUS_LABEL = Object.fromEntries(ALLIANCE_STATUSES.map((s) => [s.id, s.label]))
const OPEN_STATUSES = ['por_contactar', 'contactado', 'negociacion']

export const MAX_OFFER = 2000
export const MAX_NEXT_STEP = 500
export const MAX_NOTE = 1000

// ¿Contacto externo? (no es del equipo, ni candidato, ni está archivado). En la app del equipo,
// la marca `external` que pone el servidor (allí no llegan las candidaturas).
export function isExternalContact(c) {
  if (!c) return false
  if (typeof c.external === 'boolean') return c.external
  const candidate = Array.isArray(c.candidacies) && c.candidacies.length > 0
  return !c.teamProfile && !candidate && !c.candidateOnly && !c.archived
}

export function allianceOf(contact) {
  return contact?.alliance && typeof contact.alliance === 'object' ? contact.alliance : null
}

// Contactos externos con seguimiento, por nombre.
export function allianceContacts(contacts) {
  return contacts
    .filter((c) => isExternalContact(c) && allianceOf(c))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }))
}

// ¿El próximo paso ya debería haberse hecho? (con fecha anterior a hoy y la alianza abierta)
export function isNextStepOverdue(alliance, todayKey) {
  return !!alliance?.nextStepDate && alliance.nextStepDate < todayKey && OPEN_STATUSES.includes(alliance.status)
}

/**
 * Próximos pasos para el Inicio: los atrasados y los de esta semana (de hoy al domingo), de las
 * alianzas abiertas; cada uno { contact, alliance }, por fecha. onlyOwner: solo los de esa persona.
 */
export function nextSteps(contacts, todayKey, { onlyOwner = null } = {}) {
  const sunday = addDaysKey(mondayOf(todayKey), 6)
  const rows = allianceContacts(contacts)
    .map((contact) => ({ contact, alliance: allianceOf(contact) }))
    .filter(({ alliance }) => OPEN_STATUSES.includes(alliance.status) && alliance.nextStepDate && (!onlyOwner || alliance.ownerId === onlyOwner))
    .sort((a, b) => a.alliance.nextStepDate.localeCompare(b.alliance.nextStepDate))
  return {
    overdue: rows.filter((r) => r.alliance.nextStepDate < todayKey),
    week: rows.filter((r) => r.alliance.nextStepDate >= todayKey && r.alliance.nextStepDate <= sunday),
  }
}

// filters: { type, status, owner } ('' = todos; owner 'none' = sin responsable).
export function filterAlliances(contacts, { type = '', status = '', owner = '' } = {}) {
  return allianceContacts(contacts).filter((c) => {
    const a = allianceOf(c)
    if (type && a.type !== type) return false
    if (status && a.status !== status) return false
    if (owner === 'none' && a.ownerId) return false
    if (owner && owner !== 'none' && a.ownerId !== owner) return false
    return true
  })
}

// Tablero: una columna por estado. [{ id, label, contacts }]
export function boardColumns(contacts) {
  const list = allianceContacts(contacts)
  return ALLIANCE_STATUSES.map((s) => ({ ...s, contacts: list.filter((c) => allianceOf(c).status === s.id) }))
}

// «1.500 €»
export function amountLabel(amount) {
  if (amount === null || amount === undefined || amount === '') return ''
  return `${Number(amount).toLocaleString('es-ES', { maximumFractionDigits: 2 })} €`
}

// 'AAAA-MM-DD' → «4/11/2030».
export function dayLabel(key) {
  if (!key) return ''
  const [y, m, d] = key.split('-')
  return `${Number(d)}/${Number(m)}/${y}`
}

// ---------------------------------------------------------------------------
// Formulario
// ---------------------------------------------------------------------------

export function formFromAlliance(a) {
  return {
    type: a?.type || 'patrocinador',
    status: a?.status || 'por_contactar',
    offer: a?.offer || '',
    amount: a?.amount === null || a?.amount === undefined ? '' : String(a.amount),
    startDate: a?.startDate || '',
    endDate: a?.endDate || '',
    nextStep: a?.nextStep || '',
    nextStepDate: a?.nextStepDate || '',
    ownerId: a?.ownerId || '',
  }
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

export function validateAllianceForm(form) {
  const errors = {}
  if (form.offer.length > MAX_OFFER) errors.offer = `Como mucho ${MAX_OFFER} caracteres.`
  if (form.nextStep.length > MAX_NEXT_STEP) errors.nextStep = `Como mucho ${MAX_NEXT_STEP} caracteres.`
  const amount = String(form.amount || '').trim().replace(',', '.')
  if (amount && !/^\d{1,9}(\.\d{1,2})?$/.test(amount)) errors.amount = 'Pon un número de euros (sin signos).'
  for (const field of ['startDate', 'endDate', 'nextStepDate']) {
    if (form[field] && !DAY.test(form[field])) errors[field] = 'Fecha no válida.'
  }
  if (form.startDate && form.endDate && form.endDate < form.startDate) errors.endDate = 'El fin tiene que ser después del inicio.'
  return errors
}

// Lo que se envía o se guarda (sin notas: van aparte).
export function allianceInput(form) {
  const amount = String(form.amount || '').trim().replace(',', '.')
  return {
    type: form.type,
    status: form.status,
    offer: form.offer.trim(),
    amount: amount ? amount : null,
    startDate: form.startDate || '',
    endDate: form.endDate || '',
    nextStep: form.nextStep.trim(),
    nextStepDate: form.nextStepDate || '',
    ownerId: form.ownerId || null,
  }
}

/**
 * El seguimiento guardado (en mis datos), como lo hace cesi_alliance_save: conserva las notas y
 * guarda cuándo se cerró. ownerName: el nombre del responsable.
 */
export function applyAllianceSave(old, input, ownerName = '', now = new Date()) {
  const prev = old || {}
  const iso = now.toISOString()
  const closedAt = input.status !== 'cerrado' ? null : prev.status === 'cerrado' && prev.closedAt ? prev.closedAt : iso
  return {
    ...prev,
    ...input,
    amount: input.amount === null ? null : Number(input.amount),
    ownerName: input.ownerId ? ownerName : '',
    notes: Array.isArray(prev.notes) ? prev.notes : [],
    closedAt,
    updatedAt: iso,
  }
}

const EMPTY_ALLIANCE = { type: 'otro', status: 'por_contactar', offer: '', amount: null, startDate: '', endDate: '', nextStep: '', nextStepDate: '', ownerId: null, ownerName: '', closedAt: null }

function makeNoteId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `note_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

// Añadir una nota (la más nueva al final). Sin seguimiento, se crea (otro, por contactar).
export function addAllianceNote(old, text, { byId = null, by = '' } = {}, now = new Date()) {
  const clean = (text || '').trim()
  if (!clean) throw new Error('Escribe la nota.')
  if (clean.length > MAX_NOTE) throw new Error(`La nota puede tener como mucho ${MAX_NOTE} caracteres.`)
  const prev = old || EMPTY_ALLIANCE
  const notes = Array.isArray(prev.notes) ? prev.notes : []
  return { ...prev, notes: [...notes, { id: makeNoteId(), at: now.toISOString(), text: clean, byId, by }], updatedAt: now.toISOString() }
}

export function removeAllianceNote(old, noteId, now = new Date()) {
  return { ...old, notes: (old?.notes || []).filter((n) => n.id !== noteId), updatedAt: now.toISOString() }
}

// Notas de la más nueva a la más antigua.
export function notesNewestFirst(alliance) {
  return [...(alliance?.notes || [])].sort((a, b) => (b.at || '').localeCompare(a.at || ''))
}

// ---------------------------------------------------------------------------
// Supabase (Alianzas, en la app del equipo)
// ---------------------------------------------------------------------------

async function rpc(client, fn, args) {
  const { data, error } = await client.rpc(fn, args)
  if (error) throw new Error(allianceErrorText(error))
  return data
}

// La ficha que devuelven las funciones, como la usa la pantalla (es externa: solo esas se cambian).
function asContact(doc) {
  return { ...migrateContacts([doc]).contacts[0], external: true }
}

export async function saveExternalContact(client, id, data) {
  return asContact(await rpc(client, 'cesi_external_contact_save', { p_id: id, p_data: data }))
}

export async function saveAlliance(client, contactId, input) {
  return asContact(await rpc(client, 'cesi_alliance_save', { p_contact_id: contactId, p_alliance: input }))
}

export async function addNoteRemote(client, contactId, text) {
  return asContact(await rpc(client, 'cesi_alliance_note_add', { p_contact_id: contactId, p_text: text }))
}

export async function removeNoteRemote(client, contactId, noteId) {
  return asContact(await rpc(client, 'cesi_alliance_note_remove', { p_contact_id: contactId, p_note_id: noteId }))
}

// Responsables posibles: [{ id, name, area }].
export function listAlliancePeople(client) {
  return rpc(client, 'cesi_alliance_people', {})
}

// { closed_month, negotiating } (Directivo y la ceo; asId: «Ver como»).
export async function allianceStats(client, asId = null) {
  const rows = await rpc(client, 'cesi_alliance_stats', { p_as: asId })
  return rows?.[0] || { closed_month: 0, negotiating: 0 }
}

export function allianceErrorText(err) {
  if (err?.code === 'PGRST202' || err?.code === '42883') return 'Falta ejecutar en Supabase el SQL de la parte 16 (alianzas).'
  return err?.message || 'No se pudo guardar. Comprueba la conexión.'
}

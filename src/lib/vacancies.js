import { addMonths, parseISO } from 'date-fns'
import { createCollection, makeId } from './store'
import { eventHasTag } from './tags'
import { emptyTeamProfile, todayKey } from './team'

// Vacantes y candidatos.
//
// Vacante (cesi_vacancies_v1):
//   { id, title, area (el departamento), description, requirements, openedAt: 'AAAA-MM-DD',
//     status: 'open' | 'in_progress' | 'filled',
//     hiredContactIds: [ids de los contactos incorporados al equipo],
//     erasedCandidates: [{ discardedAt, erasedAt }]  registro anónimo de candidatos borrados }
//
// Los candidatos son contactos (con país obligatorio, como todos) con `candidacies`, una por
// vacante a la que se han presentado (una persona puede tener varias):
//   { id, vacancyId, appliedAt: 'AAAA-MM-DD', status: 'new' | 'interview' | 'accepted' | 'discarded',
//     history: [{ status, at }], discardedAt: ISO | null,
//     cv: referencia de archivo (PDF en Storage o en el dispositivo) | { url } | null,
//     notes: notas de esa candidatura }
// `candidateOnly: true` marca los contactos que existen solo por ser candidatos: solo esos se
// ocultan en Contactos (salvo con el filtro «Candidatos») y se borran enteros al borrar sus
// datos. Un contacto o miembro del equipo que se postula sigue siendo un contacto normal.
// (Antes había una sola candidatura en `candidacy`, con las notas en las del contacto: se
// convierte al leer los contactos, con migrateCandidacy.)

export const STORAGE_KEY = 'cesi_vacancies_v1'

export const vacanciesStore = createCollection(STORAGE_KEY, { prefix: 'vac' })

export function getAllVacancies() {
  return vacanciesStore.getAll().sort((a, b) => (b.openedAt || '').localeCompare(a.openedAt || ''))
}

export const VACANCY_STATUS = {
  open: 'Abierta',
  in_progress: 'En proceso',
  filled: 'Cubierta',
}

export const CANDIDATE_STATUS = {
  new: 'Nuevo',
  interview: 'Entrevista',
  accepted: 'Aceptado',
  discarded: 'Descartado',
}

export const CANDIDATE_STATUS_ORDER = ['new', 'interview', 'accepted', 'discarded']

// Tipo de reunión de las entrevistas.
export const INTERVIEW_TYPE = { category: 'Entrevista', tags: ['entrevista'] }

// Meses tras el descarte a partir de los cuales se ofrece borrar los datos del candidato.
export const RETENTION_MONTHS = 6

export function newVacancy(partial = {}) {
  return {
    title: '',
    area: '',
    description: '',
    requirements: '',
    openedAt: todayKey(),
    status: 'open',
    hiredContactIds: [],
    erasedCandidates: [],
    ...partial,
  }
}

export function candidaciesOf(contact) {
  return Array.isArray(contact?.candidacies) ? contact.candidacies : []
}

export function isCandidate(contact) {
  return candidaciesOf(contact).length > 0
}

// ¿Existe solo por ser candidato? (no es del equipo ni era ya un contacto)
export function isCandidateOnly(contact) {
  return isCandidate(contact) && !!contact.candidateOnly && !contact.teamProfile
}

export function newCandidacy(vacancyId, { appliedAt = todayKey(), cv = null, notes = '', now = new Date(), ...extra } = {}) {
  return {
    id: makeId('cand'),
    vacancyId,
    appliedAt,
    status: 'new',
    history: [{ status: 'new', at: now.toISOString() }],
    discardedAt: null,
    cv,
    notes,
    ...extra,
  }
}

/**
 * Migración: la candidatura única (`candidacy`) pasa a la lista `candidacies`, con las notas del
 * contacto (que eran las del candidato). Esos contactos existían solo como candidatos. Si ya
 * había lista (p. ej. un dispositivo con la versión anterior cambió la candidatura), se
 * actualiza la misma entrada. Devuelve el mismo contacto si no hay nada que cambiar.
 */
export function migrateCandidacy(contact) {
  if (!contact || !('candidacy' in contact)) return contact
  const { candidacy, ...rest } = contact
  if (!candidacy) return rest
  const id = `cand-${contact.id}`
  const list = candidaciesOf(rest)
  if (list.some((c) => c.id === id)) {
    return { ...rest, candidacies: list.map((c) => (c.id === id ? { ...c, ...candidacy, id } : c)) }
  }
  return {
    ...rest,
    notes: '',
    candidateOnly: list.length === 0 && !rest.teamProfile ? true : !!rest.candidateOnly,
    candidacies: [...list, { notes: contact.notes || '', ...candidacy, id }],
  }
}

// Candidaturas de una vacante: [{ contact, candidacy }].
export function candidatesOf(vacancyId, contacts) {
  return contacts.flatMap((contact) =>
    candidaciesOf(contact)
      .filter((c) => c.vacancyId === vacancyId)
      .map((candidacy) => ({ contact, candidacy })),
  )
}

// { contact, candidacy } de una candidatura, o null.
export function findCandidacy(contacts, candidacyId) {
  for (const contact of contacts) {
    const candidacy = candidaciesOf(contact).find((c) => c.id === candidacyId)
    if (candidacy) return { contact, candidacy }
  }
  return null
}

// La candidatura más reciente de un contacto (la que se abre desde Contactos), o null.
export function latestCandidacy(contact) {
  return [...candidaciesOf(contact)].sort((a, b) => (b.appliedAt || '').localeCompare(a.appliedAt || ''))[0] || null
}

// Cambio en el contacto para cambiar una de sus candidaturas: { candidacies }.
export function candidacyPatch(contact, candidacyId, patch) {
  return {
    candidacies: candidaciesOf(contact).map((c) => {
      if (c.id !== candidacyId) return c
      return typeof patch === 'function' ? patch(c) : { ...c, ...patch }
    }),
  }
}

/**
 * Quitar una candidatura: si el contacto existía solo por ella, se borra el contacto entero
 * ({ deleteContact: true }); si no, solo la candidatura ({ patch }). `files`: su CV, para borrarlo.
 */
export function removeCandidacyPlan(contact, candidacyId) {
  const removed = candidaciesOf(contact).find((c) => c.id === candidacyId)
  const rest = candidaciesOf(contact).filter((c) => c.id !== candidacyId)
  const files = removed?.cv?.store ? [removed.cv] : []
  if (isCandidateOnly(contact) && rest.length === 0) return { deleteContact: true, files }
  return { deleteContact: false, patch: { candidacies: rest }, files }
}

export function filterVacancies(vacancies, status = '') {
  return status ? vacancies.filter((v) => v.status === status) : vacancies
}

// Lista de Contactos: los que existen solo como candidatos aparecen únicamente con el filtro
// "Candidatos" (que muestra a todos los que tienen alguna candidatura).
export function contactsForList(contacts, showCandidates = false) {
  return contacts.filter((c) => (showCandidates ? isCandidate(c) : !isCandidateOnly(c)))
}

// "3 candidatos · 1 candidato descartado": los actuales y los borrados (registro anónimo).
export function vacancyCountsText(vacancy, contacts) {
  const current = candidatesOf(vacancy.id, contacts).length
  const erased = (vacancy.erasedCandidates || []).length
  const parts = [candidateCountText(current)]
  if (erased > 0) parts.push(`${candidateCountText(erased)} descartado${erased === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

// Candidaturas por estado, en el orden de las columnas: [{ status, candidates: [{ contact, candidacy }] }].
export function candidatesByStatus(vacancyId, contacts) {
  const list = candidatesOf(vacancyId, contacts).sort((a, b) => (a.candidacy.appliedAt || '').localeCompare(b.candidacy.appliedAt || ''))
  return CANDIDATE_STATUS_ORDER.map((status) => ({ status, candidates: list.filter((e) => e.candidacy.status === status) }))
}

// Nueva candidatura con el cambio de estado apuntado en el historial (y la fecha de descarte).
export function withStatus(candidacy, status, now = new Date()) {
  if (candidacy.status === status) return candidacy
  const at = now.toISOString()
  return {
    ...candidacy,
    status,
    history: [...(candidacy.history || []), { status, at }],
    discardedAt: status === 'discarded' ? at : null,
  }
}

// ¿Es una entrevista? (categoría "Entrevista" o etiqueta "entrevista").
export function isInterview(meeting) {
  return meeting.category === INTERVIEW_TYPE.category || eventHasTag(meeting, 'entrevista')
}

// Al crear una entrevista, los candidatos que participan y tenían una candidatura en "nuevo"
// pasan a "entrevista" (si tienen varias en "nuevo", la más reciente).
// Devuelve [{ id, patch }] con los cambios de cada contacto.
export function interviewUpdates(meeting, contacts, now = new Date()) {
  if (!meeting || meeting.isUnavailable || !isInterview(meeting)) return []
  const ids = meeting.participantIds || []
  return contacts
    .filter((c) => ids.includes(c.id))
    .map((c) => {
      const pending = latestCandidacy({ candidacies: candidaciesOf(c).filter((x) => x.status === 'new') })
      return pending ? { id: c.id, patch: candidacyPatch(c, pending.id, (x) => withStatus(x, 'interview', now)) } : null
    })
    .filter(Boolean)
}

// Perfil de equipo con el que se abre la incorporación de alguien que aún no es del equipo:
// cargo y departamento de la vacante, y hoy como inicio de ese rol (editable antes de guardar).
export function incorporationDraft(vacancy, now = new Date()) {
  return emptyTeamProfile({ role: vacancy?.title || '', area: vacancy?.area || '', joinedAt: todayKey(now) })
}

/**
 * Incorporar al equipo a un candidato aceptado. `teamProfile`: el perfil ya con el rol nuevo en
 * su trayectoria (el del formulario, o el que ya tenía con el rol añadido).
 * Devuelve:
 *   contactPatch: la candidatura queda aceptada, el contacto deja de ser solo candidato y tiene
 *                 teamProfile (el CV de la candidatura se conserva en el perfil si no tenía);
 *   vacancyPatch: la vacante queda cubierta y apunta al contacto incorporado;
 *   remaining:    otras candidaturas de la vacante que siguen en proceso (para ofrecer descartarlas).
 */
export function incorporate({ contact, candidacyId, vacancy, teamProfile, contacts, now = new Date() }) {
  const profile = emptyTeamProfile(teamProfile)
  const cv = candidaciesOf(contact).find((c) => c.id === candidacyId)?.cv || null
  return {
    contactPatch: {
      ...candidacyPatch(contact, candidacyId, (c) => withStatus(c, 'accepted', now)),
      candidateOnly: false,
      teamProfile: { ...profile, status: 'active', leftAt: null, ...(cv && !profile.cv ? { cv } : {}) },
    },
    vacancyPatch: {
      status: 'filled',
      hiredContactIds: [...new Set([...(vacancy.hiredContactIds || []), contact.id])],
    },
    remaining: candidatesOf(vacancy.id, contacts).filter(
      (e) => e.candidacy.id !== candidacyId && e.contact.id !== contact.id && !['discarded', 'accepted'].includes(e.candidacy.status),
    ),
  }
}

// ---------------------------------------------------------------------------
// Protección de datos
// ---------------------------------------------------------------------------

// Candidaturas descartadas hace RETENTION_MONTHS meses o más: [{ contact, candidacy }].
export function expiredDiscarded(contacts, now = new Date()) {
  return contacts.flatMap((contact) =>
    candidaciesOf(contact)
      .filter((c) => c.status === 'discarded' && c.discardedAt && addMonths(parseISO(c.discardedAt), RETENTION_MONTHS) <= now)
      .map((candidacy) => ({ contact, candidacy })),
  )
}

/**
 * Qué hay que cambiar para borrar los datos personales de esas candidaturas (`entries`:
 * [{ contact, candidacy }]):
 *   contactIds: contactos a borrar enteros (con su foto y sus CV): los que existían solo como
 *               candidatos y no tienen ninguna otra candidatura;
 *   contactPatches: [{ id, patch }] a los demás contactos solo se les quitan esas candidaturas;
 *   files: CV de las candidaturas quitadas (de los contactos que no se borran);
 *   eventPatches: reuniones de las que se quita el nombre y el id de los contactos borrados;
 *   proposalPatches: propuestas de las que se quita su id;
 *   vacancyPatches: { vacancyId: erasedCandidates } con un registro anónimo por candidatura.
 */
export function planErasure(entries, events, vacancies, now = new Date(), proposals = []) {
  const erasedIds = new Set(entries.map((e) => e.candidacy.id))
  const byContact = new Map()
  for (const { contact } of entries) byContact.set(contact.id, contact)

  const deleted = []
  const contactPatches = []
  const files = []
  for (const contact of byContact.values()) {
    const rest = candidaciesOf(contact).filter((c) => !erasedIds.has(c.id))
    if (isCandidateOnly(contact) && rest.length === 0) {
      deleted.push(contact)
    } else {
      contactPatches.push({ id: contact.id, patch: { candidacies: rest } })
      for (const c of candidaciesOf(contact)) if (erasedIds.has(c.id) && c.cv?.store) files.push(c.cv)
    }
  }

  const ids = new Set(deleted.map((c) => c.id))

  // Participantes de una reunión (o de un día cambiado de una serie) sin esos contactos, o null.
  const withoutCandidates = (item) => {
    if (!(item.participantIds || []).some((id) => ids.has(id))) return null
    const participantIds = item.participantIds.filter((id) => !ids.has(id))
    const removedNames = deleted.filter((c) => item.participantIds.includes(c.id)).map((c) => c.name)
    const participants = [...(item.participants || [])]
    for (const name of removedNames) {
      const i = participants.indexOf(name)
      if (i >= 0) participants.splice(i, 1)
    }
    return { participantIds, participants }
  }

  const eventPatches = []
  for (const ev of events) {
    const patch = { ...withoutCandidates(ev) }
    let exceptions = null
    for (const [key, ex] of Object.entries(ev.exceptions || {})) {
      const fields = ex && withoutCandidates(ex)
      if (!fields) continue
      exceptions = exceptions || { ...ev.exceptions }
      exceptions[key] = { ...ex, ...fields }
    }
    if (exceptions) patch.exceptions = exceptions
    if (Object.keys(patch).length > 0) eventPatches.push({ id: ev.id, patch })
  }

  const proposalPatches = proposals
    .filter((p) => (p.participantIds || []).some((id) => ids.has(id)))
    .map((p) => ({ id: p.id, patch: { participantIds: p.participantIds.filter((id) => !ids.has(id)) } }))

  const vacancyPatches = {}
  for (const { candidacy } of entries) {
    const vacancy = vacancies.find((v) => v.id === candidacy.vacancyId)
    if (!vacancy) continue
    const list = vacancyPatches[vacancy.id] || [...(vacancy.erasedCandidates || [])]
    list.push({ discardedAt: candidacy.discardedAt, erasedAt: now.toISOString() })
    vacancyPatches[vacancy.id] = list
  }

  return { contactIds: [...ids], contactPatches, files, eventPatches, proposalPatches, vacancyPatches }
}

// "3 candidatos", "1 candidato"
export function candidateCountText(n) {
  return `${n} candidato${n === 1 ? '' : 's'}`
}

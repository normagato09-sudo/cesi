import { addMonths, parseISO } from 'date-fns'
import { createCollection } from './store'
import { eventHasTag } from './tags'
import { emptyTeamProfile, joinedLine, todayKey } from './team'

// Vacantes y candidatos.
//
// Vacante (cesi_vacancies_v1):
//   { id, title, area (el departamento), description, requirements, openedAt: 'AAAA-MM-DD',
//     status: 'open' | 'in_progress' | 'filled',
//     hiredContactIds: [ids de los contactos incorporados al equipo],
//     erasedCandidates: [{ discardedAt, erasedAt }]  registro anónimo de candidatos borrados }
//
// Cada candidato es un contacto (con país obligatorio, como todos) con `candidacy`:
//   { vacancyId, appliedAt: 'AAAA-MM-DD', status: 'new' | 'interview' | 'accepted' | 'discarded',
//     history: [{ status, at }], discardedAt: ISO | null,
//     cv: referencia de archivo (PDF en Storage o en el dispositivo) | { url } | null }
// Las notas del candidato son las notas del contacto.

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

// Tipo de reunión de las entrevistas (se aplican las reglas que haya para él).
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

export function isCandidate(contact) {
  return !!contact?.candidacy
}

export function newCandidacy(vacancyId, { appliedAt = todayKey(), cv = null, now = new Date() } = {}) {
  return { vacancyId, appliedAt, status: 'new', history: [{ status: 'new', at: now.toISOString() }], discardedAt: null, cv }
}

export function candidatesOf(vacancyId, contacts) {
  return contacts.filter((c) => c.candidacy?.vacancyId === vacancyId)
}

export function filterVacancies(vacancies, status = '') {
  return status ? vacancies.filter((v) => v.status === status) : vacancies
}

// Lista de Contactos: los candidatos solo aparecen con el filtro "Candidatos".
export function contactsForList(contacts, showCandidates = false) {
  return contacts.filter((c) => (showCandidates ? isCandidate(c) : !isCandidate(c)))
}

// "3 candidatos · 1 candidato descartado": los actuales y los borrados (registro anónimo).
export function vacancyCountsText(vacancy, contacts) {
  const current = candidatesOf(vacancy.id, contacts).length
  const erased = (vacancy.erasedCandidates || []).length
  const parts = [candidateCountText(current)]
  if (erased > 0) parts.push(`${candidateCountText(erased)} descartado${erased === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

// Candidatos por estado, en el orden de las columnas.
export function candidatesByStatus(vacancyId, contacts) {
  const list = candidatesOf(vacancyId, contacts).sort((a, b) => (a.candidacy.appliedAt || '').localeCompare(b.candidacy.appliedAt || ''))
  return CANDIDATE_STATUS_ORDER.map((status) => ({ status, candidates: list.filter((c) => c.candidacy.status === status) }))
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

function isInterview(meeting) {
  return meeting.category === INTERVIEW_TYPE.category || eventHasTag(meeting, 'entrevista')
}

// Al crear una entrevista, los candidatos que participan y estaban en "nuevo" pasan a
// "entrevista". Devuelve [{ id, candidacy }] con los cambios.
export function interviewUpdates(meeting, contacts, now = new Date()) {
  if (!meeting || meeting.isUnavailable || !isInterview(meeting)) return []
  const ids = meeting.participantIds || []
  return contacts
    .filter((c) => ids.includes(c.id) && c.candidacy?.status === 'new')
    .map((c) => ({ id: c.id, candidacy: withStatus(c.candidacy, 'interview', now) }))
}

// Perfil de equipo con el que se abre la incorporación: cargo y departamento de la vacante, hoy,
// y la trayectoria empieza con "DD/MM/AAAA – Se incorporó como [cargo]" (editable antes de guardar).
export function incorporationDraft(vacancy, now = new Date()) {
  const joinedAt = todayKey(now)
  const role = vacancy?.title || ''
  return emptyTeamProfile({ role, area: vacancy?.area || '', joinedAt, bio: joinedLine(joinedAt, role) })
}

/**
 * Incorporar al equipo a un candidato aceptado.
 * Devuelve:
 *   contactPatch: deja de ser candidato (candidacy null) y pasa a tener teamProfile (el que se
 *                 guardó en el formulario, con su trayectoria; el CV se conserva en el perfil);
 *   vacancyPatch: la vacante queda cubierta y apunta al contacto incorporado;
 *   remaining:    otros candidatos de la vacante que siguen en proceso (para ofrecer descartarlos).
 */
export function incorporate({ contact, vacancy, teamProfile, contacts }) {
  const profile = emptyTeamProfile(teamProfile)
  const cv = contact.candidacy?.cv || null
  return {
    contactPatch: {
      candidacy: null,
      teamProfile: { ...profile, status: 'active', leftAt: null, ...(cv ? { cv } : {}) },
    },
    vacancyPatch: {
      status: 'filled',
      hiredContactIds: [...new Set([...(vacancy.hiredContactIds || []), contact.id])],
    },
    remaining: candidatesOf(vacancy.id, contacts).filter((c) => c.id !== contact.id && c.candidacy.status !== 'discarded'),
  }
}

// ---------------------------------------------------------------------------
// Protección de datos
// ---------------------------------------------------------------------------

// Candidatos descartados hace RETENTION_MONTHS meses o más.
export function expiredDiscarded(contacts, now = new Date()) {
  return contacts.filter((c) => {
    const at = c.candidacy?.status === 'discarded' && c.candidacy.discardedAt
    return at && addMonths(parseISO(at), RETENTION_MONTHS) <= now
  })
}

/**
 * Qué hay que cambiar para borrar los datos personales de esos candidatos:
 *   contactIds: contactos a borrar (con su foto y su CV);
 *   eventPatches: reuniones de las que se quita su nombre y su id;
 *   proposalPatches: propuestas de las que se quita su id;
 *   vacancyPatches: { vacancyId: erasedCandidates } con un registro anónimo por candidato.
 */
export function planErasure(candidates, events, vacancies, now = new Date(), proposals = []) {
  const ids = new Set(candidates.map((c) => c.id))
  const names = new Set(candidates.map((c) => c.name))

  // Participantes de una reunión (o de un día cambiado de una serie) sin esos candidatos, o null.
  const withoutCandidates = (item) => {
    if (!(item.participantIds || []).some((id) => ids.has(id))) return null
    const participantIds = item.participantIds.filter((id) => !ids.has(id))
    const removedNames = candidates.filter((c) => item.participantIds.includes(c.id)).map((c) => c.name)
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
  for (const c of candidates) {
    const vacancy = vacancies.find((v) => v.id === c.candidacy.vacancyId)
    if (!vacancy) continue
    const list = vacancyPatches[vacancy.id] || [...(vacancy.erasedCandidates || [])]
    list.push({ discardedAt: c.candidacy.discardedAt, erasedAt: now.toISOString() })
    vacancyPatches[vacancy.id] = list
  }

  return { contactIds: [...ids], eventPatches, proposalPatches, vacancyPatches, names: [...names] }
}

// "3 candidatos", "1 candidato"
export function candidateCountText(n) {
  return `${n} candidato${n === 1 ? '' : 's'}`
}

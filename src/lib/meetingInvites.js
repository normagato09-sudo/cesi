import { addDays, differenceInCalendarDays, parseISO } from 'date-fns'
import { participantsOf } from './contacts'
import { contactZone } from './contactAvailability'
import { newLinkToken, PUBLIC_URL } from './contactLinks'
import { dateKey, expandEvent } from './recurrence'
import { SCOPES, occurrenceKeyOf } from './seriesEdits'
import { meetingWhen } from './meetingWhen'
import { localTimeZone } from './timezones'

// Confirmación de asistencia: un enlace por participante y reunión (en una serie, por día) a la
// página pública /confirmar/<token> (tabla meeting_invites de Supabase). La persona responde
// "Voy", "No puedo" o "Quizás" con cualquier comentario, y la respuesta llega aquí.
// Solo funciona con la sincronización activa.

export const RESPONSE = { YES: 'yes', NO: 'no', MAYBE: 'maybe' }
// Estado de cada participante: una respuesta, 'reconfirm' (respondió pero la reunión ha cambiado
// de hora) o 'pending' (sin responder).
export const INVITE_STATUS = { ...RESPONSE, RECONFIRM: 'reconfirm', PENDING: 'pending' }

export const STATUS_TEXT = {
  yes: 'Va',
  no: 'No puede',
  maybe: 'Quizás',
  reconfirm: 'A confirmar de nuevo',
  pending: 'Sin responder',
}

export const STATUS_ICON = { yes: '✓', no: '✗', maybe: '?', reconfirm: '↻', pending: '' }

// ---------------------------------------------------------------------------
// Qué reunión y qué participante
// ---------------------------------------------------------------------------

export function participantKeyOf(entry) {
  return entry.contact ? `contact:${entry.contact.id}` : `guest:${entry.guest}`
}

// Reunión del enlace: { eventId, key } ('' en una reunión única; el día de la serie si se repite).
export function occurrenceRef(occurrence) {
  return {
    eventId: occurrence.seriesId || occurrence.id,
    key: occurrence.recurrence ? occurrenceKeyOf(occurrence) : '',
  }
}

const sameRef = (invite, ref) => invite.event_id === ref.eventId && invite.occurrence_key === ref.key

// Enlaces activos de una ocurrencia: Map participant_key → enlace.
export function invitesOf(invites, occurrence) {
  const ref = occurrenceRef(occurrence)
  const out = new Map()
  for (const invite of invites) {
    if (!invite.revoked && sameRef(invite, ref)) out.set(invite.participant_key, invite)
  }
  return out
}

export function inviteStatus(invite) {
  if (!invite || !invite.response) return INVITE_STATUS.PENDING
  if (invite.needs_reconfirm) return INVITE_STATUS.RECONFIRM
  return invite.response
}

// ¿Se puede pedir confirmación? Reuniones (no franjas no disponibles ni opciones de una
// propuesta) con participantes que aún no han empezado.
export function canAskConfirmation(occurrence, now = new Date()) {
  if (!occurrence || occurrence.isUnavailable || occurrence.provisional) return false
  return new Date(occurrence.start) > now
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`
}

// "4 van · 1 no puede · 2 sin responder" (sin las partes a cero). `statuses`: lista de INVITE_STATUS.
export function inviteSummaryText(statuses) {
  const count = (s) => statuses.filter((x) => x === s).length
  const parts = []
  const yes = count('yes')
  const no = count('no')
  const maybe = count('maybe')
  const reconfirm = count('reconfirm')
  const pending = count('pending')
  if (yes) parts.push(plural(yes, 'va', 'van'))
  if (no) parts.push(plural(no, 'no puede', 'no pueden'))
  if (maybe) parts.push(`${maybe} quizás`)
  if (reconfirm) parts.push(`${reconfirm} a confirmar de nuevo`)
  if (pending) parts.push(`${pending} sin responder`)
  return parts.join(' · ')
}

// Resumen de una ocurrencia, o null si aún no se ha pedido confirmación a nadie.
// Los participantes sin enlace (añadidos después) cuentan como sin responder.
export function occurrenceSummary(invites, occurrence, contacts) {
  const byKey = invitesOf(invites, occurrence)
  if (byKey.size === 0) return null
  const { contacts: people, guests } = participantsOf(occurrence, contacts)
  const keys = [...people.map((c) => `contact:${c.id}`), ...guests.map((g) => `guest:${g}`)]
  return inviteSummaryText(keys.map((k) => inviteStatus(byKey.get(k))))
}

// ---------------------------------------------------------------------------
// Enlace y mensaje
// ---------------------------------------------------------------------------

export function meetingInviteUrl(token, base = PUBLIC_URL || globalThis.location?.origin || '') {
  return `${base.trim().replace(/\/+$/, '')}/confirmar/${token}`
}

// Zona de cada participante: la de su ficha; los invitados sueltos, la de este dispositivo.
export function participantZone(entry, myZone = localTimeZone()) {
  return entry.contact ? contactZone(entry.contact) : myZone
}

// "Hola, Ana. ¿Puedes confirmar si vienes a «Revisión» el lunes 5 de octubre a las 10:00 (hora de España)? <enlace>"
export function inviteMessage({ name, title, start, allDay, timeZone }, url) {
  const firstName = (name || '').trim().split(/\s+/)[0]
  const { day, time, place } = meetingWhen(start, timeZone)
  const when = allDay ? `el ${day}` : `el ${day} a las ${time} (hora de ${place})`
  return `Hola${firstName ? `, ${firstName}` : ''}. ¿Puedes confirmar si vienes a «${title || 'la reunión'}» ${when}? ${url}`
}

// ---------------------------------------------------------------------------
// Mantener los enlaces al día con la reunión
// ---------------------------------------------------------------------------

const WIDE = 400

// Ocurrencia del enlace en la serie, o null si ya no existe (borrada, cancelada, fuera de la serie).
export function occurrenceForInvite(series, key) {
  if (!series || series.isUnavailable) return null
  if (!series.recurrence) {
    return key === '' ? expandEvent(series, new Date(-8.64e15), new Date(8.64e15))[0] || null : null
  }
  if (!key) return null
  // Un día cambiado puede haberse movido: se busca con margen alrededor del día que le tocaba.
  const day = parseISO(key)
  return expandEvent(series, addDays(day, -WIDE), addDays(day, WIDE)).find((o) => occurrenceKeyOf(o) === key) || null
}

function stillInvited(occurrence, participantKey, contacts) {
  const { contacts: people, guests } = participantsOf(occurrence, contacts)
  if (participantKey.startsWith('contact:')) return people.some((c) => `contact:${c.id}` === participantKey)
  return guests.some((g) => `guest:${g}` === participantKey)
}

/**
 * Qué hay que cambiar en los enlaces activos (sin desactivar y de reuniones que aún no han
 * terminado) para que sigan a sus reuniones:
 *   revoke      tokens que dejan de valer: la reunión o ese día ya no existe o el participante ya no está;
 *   reschedule  [{ token, starts_at, ends_at }]: la reunión ha cambiado de hora;
 *   notices     [{ eventId, key, title, start }]: reuniones que han cambiado de hora (hay que reenviar).
 */
export function reconcilePlan(invites, rawEvents, contacts, now = new Date()) {
  const byId = new Map(rawEvents.map((ev) => [ev.id, ev]))
  const revoke = []
  const reschedule = []
  const notices = new Map()
  const cache = new Map()
  for (const invite of invites) {
    if (invite.revoked || new Date(invite.ends_at) <= now) continue
    const cacheKey = `${invite.event_id}|${invite.occurrence_key}`
    if (!cache.has(cacheKey)) cache.set(cacheKey, occurrenceForInvite(byId.get(invite.event_id), invite.occurrence_key))
    const occurrence = cache.get(cacheKey)
    if (!occurrence || !stillInvited(occurrence, invite.participant_key, contacts)) {
      revoke.push(invite.token)
      continue
    }
    const start = new Date(occurrence.start)
    const end = new Date(occurrence.end)
    if (start.getTime() !== new Date(invite.starts_at).getTime() || end.getTime() !== new Date(invite.ends_at).getTime()) {
      reschedule.push({ token: invite.token, starts_at: start.toISOString(), ends_at: end.toISOString() })
      if (!notices.has(cacheKey)) {
        notices.set(cacheKey, { eventId: invite.event_id, key: invite.occurrence_key, title: occurrence.title, start })
      }
    }
  }
  return { revoke, reschedule, notices: [...notices.values()] }
}

const shiftKey = (key, days) => (days ? dateKey(addDays(parseISO(key), days)) : key)

/**
 * Enlaces que cambian de reunión o de día al guardar un cambio de hora en una reunión:
 * [{ token, event_id, occurrence_key }], en un orden que no choca con el índice de un solo
 * enlace activo por participante y día. Después, reconcilePlan ajusta la hora.
 *   series    la reunión antes del cambio; updated: después
 *   occurrence  el día que se ha cambiado; scope: SCOPES (en una serie)
 *   newEvent  la serie nueva, si el cambio es "este y los siguientes"
 */
export function inviteMoves(invites, { series, updated, occurrence, scope, newEvent = null }) {
  const own = invites.filter((i) => !i.revoked && i.event_id === series.id)
  if (own.length === 0) return []

  // Reunión única que pasa a repetirse: su enlace es el del primer día.
  if (!series.recurrence) {
    if (!updated?.recurrence) return []
    return own.filter((i) => i.occurrence_key === '').map((i) => ({ token: i.token, event_id: series.id, occurrence_key: dateKey(new Date(updated.start)) }))
  }
  if (scope === SCOPES.THIS) return []

  const fromKey = occurrenceKeyOf(occurrence)
  if (newEvent) {
    // "Este y los siguientes": los días desde ese pasan a la serie nueva.
    const originalStart = new Date(occurrence.originalStart || occurrence.start)
    const delta = differenceInCalendarDays(new Date(newEvent.start), originalStart)
    const later = own.filter((i) => i.occurrence_key >= fromKey)
    if (!newEvent.recurrence) {
      return later.filter((i) => i.occurrence_key === fromKey).map((i) => ({ token: i.token, event_id: newEvent.id, occurrence_key: '' }))
    }
    return later.map((i) => ({ token: i.token, event_id: newEvent.id, occurrence_key: shiftKey(i.occurrence_key, delta) }))
  }

  // Toda la serie. Si deja de repetirse, queda solo ese día.
  if (!updated.recurrence) {
    return own.filter((i) => i.occurrence_key === fromKey).map((i) => ({ token: i.token, event_id: series.id, occurrence_key: '' }))
  }
  const delta = differenceInCalendarDays(new Date(updated.start), new Date(series.start))
  if (!delta) return []
  // Hacia delante se mueven primero los días más tardíos (y al revés), para no pisar un día aún ocupado.
  const ordered = [...own].sort((a, b) => (delta > 0 ? b.occurrence_key.localeCompare(a.occurrence_key) : a.occurrence_key.localeCompare(b.occurrence_key)))
  return ordered.map((i) => ({ token: i.token, event_id: series.id, occurrence_key: shiftKey(i.occurrence_key, delta) }))
}

// Un invitado que se guarda como contacto conserva su enlace (y su respuesta).
// Con `key`, solo ese día de la serie (si el cambio es solo de ese día).
export function guestToContactMoves(invites, eventId, guest, contactId, key = null) {
  return invites
    .filter((i) => !i.revoked && i.event_id === eventId && i.participant_key === `guest:${guest}`)
    .filter((i) => key === null || i.occurrence_key === key)
    .map((i) => ({ token: i.token, participant_key: `contact:${contactId}` }))
}

// Filas nuevas para los participantes de la ocurrencia que aún no tienen enlace.
export function missingInviteRows(invites, occurrence, entries, makeToken = newLinkToken) {
  const existing = invitesOf(invites, occurrence)
  const { eventId, key } = occurrenceRef(occurrence)
  return entries
    .filter((entry) => !existing.has(participantKeyOf(entry)))
    .map((entry) => ({
      token: makeToken(),
      event_id: eventId,
      occurrence_key: key,
      participant_key: participantKeyOf(entry),
      name: (entry.name || '').slice(0, 200),
      starts_at: new Date(occurrence.start).toISOString(),
      ends_at: new Date(occurrence.end).toISOString(),
    }))
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

const TABLE = 'meeting_invites'
const COLUMNS = 'token,event_id,occurrence_key,participant_key,name,starts_at,ends_at,response,comment,responded_at,needs_reconfirm,revoked'
// Se cargan también las respuestas de las reuniones de los últimos días (para verlas después).
const HISTORY_DAYS = 90

function check({ data, error }) {
  if (!error) return data
  if (error.code === '42P01' || error.code === 'PGRST205') {
    throw new Error('Falta preparar Supabase: ejecuta el SQL de la confirmación de asistencia en el SQL Editor.')
  }
  throw Object.assign(new Error(error.message || 'No se pudo conectar con Supabase.'), { code: error.code })
}

export async function fetchInvites(client, now = new Date()) {
  const since = addDays(now, -HISTORY_DAYS).toISOString()
  return check(await client.from(TABLE).select(COLUMNS).eq('revoked', false).gt('ends_at', since).order('created_at').limit(5000)) || []
}

// Enlaces activos de una reunión (o día), recién leídos de la nube.
export async function fetchOccurrenceInvites(client, ref) {
  return check(await client.from(TABLE).select(COLUMNS).eq('revoked', false).eq('event_id', ref.eventId).eq('occurrence_key', ref.key)) || []
}

export async function insertInvites(client, rows) {
  if (rows.length === 0) return []
  return check(await client.from(TABLE).insert(rows).select(COLUMNS)) || []
}

// patch: solo los campos que la app puede cambiar (event_id, occurrence_key, participant_key,
// name, starts_at, ends_at, revoked). La respuesta solo la cambia la persona desde su enlace.
export async function updateInvite(client, token, patch) {
  check(await client.from(TABLE).update(patch).eq('token', token))
}

// Cambios en tiempo real (respuestas). Devuelve una función para dejar de escuchar.
export function subscribeInvites(client, userId, onRow) {
  const channel = client
    .channel(`cesi-invites-${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE, filter: `user_id=eq.${userId}` }, (payload) => {
      if (payload.new && payload.new.token) onRow(payload.new)
    })
    .subscribe()
  return () => client.removeChannel(channel)
}

import { subDays } from 'date-fns'
import { expandEvents } from './recurrence'
import { sessionKeyOf, sessionOf, sessionPatch } from './meetingSession'

// Notas de lo que se habló en cada reunión: el texto del acta (ver meetingSession.js).
// - Reunión única: campo `notes` (texto).
// - Reunión que se repite: `notesByDate` { 'AAAA-MM-DD': 'texto' }, una nota por cada día concreto.

export const MISSING_NOTES_DAYS = 7

// Día (hora local) de una ocurrencia, clave de notesByDate. Si ese día se ha movido solo a otra
// hora o a otro día, sigue siendo el día que le tocaba en la serie.
export function occurrenceDateKey(occurrence) {
  return sessionKeyOf(occurrence)
}

// Notas de una ocurrencia (o de una reunión única).
export function notesOf(occurrence) {
  return sessionOf(occurrence).notes
}

// ¿Tiene acta (notas o decisiones)?
export function hasNotes(occurrence) {
  const { notes, decisions } = sessionOf(occurrence)
  return notes.trim() !== '' || decisions.length > 0
}

// Cambio que hay que guardar en la serie `series` para poner `text` como notas de `occurrence`.
export function notesPatch(series, occurrence, text) {
  return sessionPatch(series, occurrence, { notes: text })
}

// Principio de las notas en una sola línea ("Quedamos en enviar el presupuesto…").
export function notesPreview(text, max = 80) {
  const line = (text || '').replace(/\s+/g, ' ').trim()
  if (line.length <= max) return line
  return `${line.slice(0, max - 1).trimEnd()}…`
}

// ¿Cuenta como reunión para notas y resúmenes? Los bloques "No disponible" y las opciones
// provisionales de una propuesta no.
export function isRealMeeting(ev) {
  return !ev.isUnavailable && !ev.provisional
}

// ¿Es una reunión mía (cuenta en el Resumen y en el Inicio)? Las que organizo sin asistir no.
export function isMyMeeting(ev) {
  return isRealMeeting(ev) && !ev.notAttending
}

// Reuniones de los últimos `days` días que ya han terminado y no tienen notas, de la más
// reciente a la más antigua.
export function meetingsMissingNotes(rawEvents, now = new Date(), days = MISSING_NOTES_DAYS) {
  const from = subDays(now, days)
  return expandEvents(rawEvents.filter(isRealMeeting), from, now)
    .filter((ev) => ev.start >= from && ev.end <= now && !hasNotes(ev))
    .sort((a, b) => b.start - a.start)
}

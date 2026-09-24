import { format, subDays } from 'date-fns'
import { expandEvents } from './recurrence'

// Notas de lo que se habló en cada reunión.
// - Reunión única: campo `notes` (texto).
// - Reunión que se repite: `notesByDate` { 'AAAA-MM-DD': 'texto' }, una nota por cada día concreto.

export const MISSING_NOTES_DAYS = 7

// Día (hora local) de una ocurrencia, clave de notesByDate.
export function occurrenceDateKey(occurrence) {
  return format(new Date(occurrence.start), 'yyyy-MM-dd')
}

// Notas de una ocurrencia (o de una reunión única).
export function notesOf(occurrence) {
  if (!occurrence) return ''
  if (occurrence.recurrence) return occurrence.notesByDate?.[occurrenceDateKey(occurrence)] || ''
  return occurrence.notes || ''
}

export function hasNotes(occurrence) {
  return notesOf(occurrence).trim() !== ''
}

// Cambio que hay que guardar en la serie `series` para poner `text` como notas de `occurrence`.
export function notesPatch(series, occurrence, text) {
  if (!series.recurrence) return { notes: text }
  const key = occurrenceDateKey(occurrence)
  const notesByDate = { ...(series.notesByDate || {}) }
  if (text.trim()) notesByDate[key] = text
  else delete notesByDate[key]
  return { notesByDate }
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

// Reuniones de los últimos `days` días que ya han terminado y no tienen notas, de la más
// reciente a la más antigua.
export function meetingsMissingNotes(rawEvents, now = new Date(), days = MISSING_NOTES_DAYS) {
  const from = subDays(now, days)
  return expandEvents(rawEvents.filter(isRealMeeting), from, now)
    .filter((ev) => ev.start >= from && ev.end <= now && !hasNotes(ev))
    .sort((a, b) => b.start - a.start)
}

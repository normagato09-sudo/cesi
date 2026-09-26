import { expandEvents } from './recurrence'
import { isExcluded } from './conflicts'

// Aviso de margen entre reuniones: una reunión que deja menos minutos que `bufferMinutes`
// con la reunión anterior o la siguiente se puede guardar igualmente (los solapes reales se
// bloquean aparte, en conflicts.js). Los bloques "No disponible" no llevan margen.

function countsForBuffer(ev) {
  return !ev.isUnavailable && !ev.allDay
}

function gapText(minutes, which, title) {
  const who = title ? ` («${title}»)` : ''
  if (minutes === 0) return `No queda margen con la reunión ${which}${who}.`
  return `Quedan solo ${minutes} min con la reunión ${which}${who}.`
}

/**
 * Motivos por los que `meeting` ({ start, end, isUnavailable, allDay }) no respeta el margen con
 * las reuniones de `occurrences` (ya expandidas). Devuelve [{ type: 'buffer', side, minutes, message }].
 */
export function checkMeetingBuffer(meeting, occurrences, bufferMinutes, exclude = {}) {
  if (!(bufferMinutes > 0) || !countsForBuffer(meeting)) return []
  const start = new Date(meeting.start)
  const end = new Date(meeting.end)
  const bufferMs = bufferMinutes * 60000

  let previous = null
  let next = null
  for (const ev of occurrences) {
    if (!countsForBuffer(ev) || isExcluded(ev, exclude)) continue
    const evStart = new Date(ev.start)
    const evEnd = new Date(ev.end)
    // Si se solapan no es un problema de margen sino un conflicto.
    if (evStart < end && evEnd > start) continue
    if (evEnd <= start && start - evEnd < bufferMs && (!previous || evEnd > previous.end)) {
      previous = { ev, end: evEnd }
    }
    if (evStart >= end && evStart - end < bufferMs && (!next || evStart < next.start)) {
      next = { ev, start: evStart }
    }
  }

  const warnings = []
  if (previous) {
    const minutes = Math.round((start - previous.end) / 60000)
    warnings.push({ type: 'buffer', side: 'previous', minutes, message: gapText(minutes, 'anterior', previous.ev.title) })
  }
  if (next) {
    const minutes = Math.round((next.start - end) / 60000)
    warnings.push({ type: 'buffer', side: 'next', minutes, message: gapText(minutes, 'siguiente', next.ev.title) })
  }
  return warnings
}

// Igual que checkMeetingBuffer, a partir de las reuniones guardadas (sin expandir).
export function bufferWarningsFor(meeting, rawEvents, bufferMinutes, options) {
  if (!(bufferMinutes > 0)) return []
  const start = new Date(meeting.start)
  const end = new Date(meeting.end)
  const bufferMs = bufferMinutes * 60000
  const nearby = expandEvents(rawEvents, new Date(start.getTime() - bufferMs), new Date(end.getTime() + bufferMs))
  return checkMeetingBuffer(meeting, nearby, bufferMinutes, options)
}

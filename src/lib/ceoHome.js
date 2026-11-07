import { addDays, startOfDay } from 'date-fns'
import { meetingsTodayAndTomorrow } from './home'
import { isNewAccount } from './profiles'
import { sharedEventsForCalendar } from './sharedCalendar'
import { isActiveMember } from './team'

// Inicio de la ceo (CeoHome.jsx): «Necesita tu atención», «Tu equipo hoy», «De un vistazo» y «Tu
// agenda de hoy». Funciones puras sobre lo que ya se carga.

const emailOf = (s) => String(s || '').trim().toLowerCase()

// Alumnos con la cuenta creada en los últimos 7 días (para revisar en Accesos).
export function newStudentAccounts(profiles, now = new Date()) {
  return profiles.filter((p) => p.role === 'alumno' && isNewAccount(p, now))
}

/**
 * Cuentas que seguramente hay que pasar a «Equipo»: las pendientes (de antes de que las nuevas
 * entraran como alumno) y las de alumno con el mismo email que alguien de Equipo.
 */
export function accountsToPromote(profiles, contacts) {
  const teamEmails = new Set(contacts.filter(isActiveMember).map((c) => emailOf(c.email)).filter(Boolean))
  return profiles.filter((p) => p.role === 'pendiente' || (p.role === 'alumno' && teamEmails.has(emailOf(p.email))))
}

/**
 * Filas de «Necesita tu atención» (solo las que tienen algo): [{ id, count, label, section }].
 * section: la pantalla a la que lleva.
 */
export function attentionItems({ newStudents = 0, toPromote = 0, stale = 0, overdue = 0, proposals = 0, unread = 0, applications = 0 }) {
  const plural = (n, one, many) => (n === 1 ? one : many)
  return [
    { id: 'unread', count: unread, label: plural(unread, 'mensaje sin leer', 'mensajes sin leer'), section: 'messages' },
    // Candidaturas a vacantes que aún no he visto (parte 40).
    { id: 'applications', count: applications, label: plural(applications, 'candidatura nueva a una vacante', 'candidaturas nuevas a vacantes'), section: 'vacancies' },
    { id: 'new-students', count: newStudents, label: plural(newStudents, 'alumno nuevo para revisar', 'alumnos nuevos para revisar'), section: 'access' },
    { id: 'promote', count: toPromote, label: plural(toPromote, 'cuenta para cambiar a equipo', 'cuentas para cambiar a equipo'), section: 'access' },
    { id: 'stale', count: stale, label: plural(stale, 'fichaje sin salida', 'fichajes sin salida'), section: 'clockins' },
    { id: 'overdue', count: overdue, label: plural(overdue, 'tarea atrasada', 'tareas atrasadas'), section: 'team-tasks' },
    { id: 'proposals', count: proposals, label: plural(proposals, 'propuesta de reunión pendiente', 'propuestas de reunión pendientes'), section: 'calendar' },
  ].filter((i) => i.count > 0)
}

// % de objetivos del mes conseguidos (null si no hay ninguno).
export function goalsDonePercent(goals) {
  if (goals.length === 0) return null
  return Math.round((goals.filter((g) => g.status === 'conseguido').length / goals.length) * 100)
}

// Mis reuniones de hoy: las de mi calendario y las compartidas que he aceptado o tengo pendientes.
export function meetingsToday(rawEvents, sharedRows, now = new Date()) {
  const from = startOfDay(now)
  const to = addDays(from, 1)
  const shared = sharedEventsForCalendar(sharedRows || []).filter((ev) => ev.start >= from && ev.start < to)
  return [...meetingsTodayAndTomorrow(rawEvents, now).today, ...shared].sort((a, b) => a.start - b.start)
}

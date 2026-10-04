import { addDays, parseISO, startOfDay } from 'date-fns'
import { dateKey, expandEvents } from './recurrence'
import { sessionOf } from './meetingSession'
import { isRealMeeting } from './notes'
import { participantsOf } from './contacts'
import { isOverdue, sortTasks } from './tasks'
import { candidatesOf, isInterview } from './vacancies'

// Panel de Inicio: lo que hay que tener a mano al abrir la app. Funciones puras; HomeView las pinta.

export const UPCOMING_TASK_DAYS = 7
export const UPCOMING_INTERVIEW_DAYS = 14

// "Buenos días" hasta las 14:00, "Buenas tardes" hasta las 21:00 y luego "Buenas noches".
export function greeting(now) {
  const h = now.getHours()
  if (h >= 6 && h < 14) return 'Buenos días'
  if (h >= 14 && h < 21) return 'Buenas tardes'
  return 'Buenas noches'
}

// Participantes en una línea: "Ana, Luis, Marta y 2 más" (nombres de pila).
export function participantsLine(event, contacts, max = 3) {
  const { contacts: people, guests } = participantsOf(event, contacts)
  const names = [...people.map((c) => (c.name || '').split(' ')[0]), ...guests].filter(Boolean)
  if (names.length <= max) return names.join(', ')
  return `${names.slice(0, max).join(', ')} y ${names.length - max} más`
}

// ¿Tiene agenda preparada (algún punto)?
export function hasAgenda(occurrence) {
  return sessionOf(occurrence).agenda.length > 0
}

function meetingsBetween(rawEvents, from, to) {
  return expandEvents(rawEvents.filter(isRealMeeting), from, to)
    .filter((ev) => ev.start >= from && ev.start < to)
    .sort((a, b) => a.start - b.start)
}

// Reuniones (sin franjas "No disponible" ni opciones provisionales) de hoy y de mañana.
export function meetingsTodayAndTomorrow(rawEvents, now) {
  const today = startOfDay(now)
  const tomorrow = addDays(today, 1)
  return {
    today: meetingsBetween(rawEvents, today, tomorrow),
    tomorrow: meetingsBetween(rawEvents, tomorrow, addDays(today, 2)),
  }
}

// Tareas pendientes vencidas, para hoy y para los próximos 7 días (de mañana en adelante).
export function dueTasks(tasks, today, days = UPCOMING_TASK_DAYS) {
  const last = dateKey(addDays(parseISO(today), days))
  const pending = sortTasks(tasks.filter((t) => t.status !== 'done' && t.dueDate))
  return {
    overdue: pending.filter((t) => isOverdue(t, today)),
    today: pending.filter((t) => t.dueDate === today),
    upcoming: pending.filter((t) => t.dueDate > today && t.dueDate <= last),
  }
}

// Entrevistas (categoría o etiqueta "Entrevista") que aún no han terminado, de los próximos 14 días.
export function upcomingInterviews(rawEvents, now, days = UPCOMING_INTERVIEW_DAYS) {
  return expandEvents(rawEvents.filter(isRealMeeting).filter(isInterview), now, addDays(now, days))
    .filter((ev) => ev.end > now)
    .sort((a, b) => a.start - b.start)
}

// Vacantes sin cubrir (abiertas o en proceso), con sus candidatos nuevos y en entrevista.
export function openVacancies(vacancies, contacts) {
  return vacancies
    .filter((v) => v.status !== 'filled')
    .map((vacancy) => {
      const candidacies = candidatesOf(vacancy.id, contacts).map((e) => e.candidacy)
      return {
        vacancy,
        newCount: candidacies.filter((c) => c.status === 'new').length,
        interviewCount: candidacies.filter((c) => c.status === 'interview').length,
      }
    })
}

// "2 nuevos · 1 en entrevista", o "Sin candidatos en curso".
export function vacancyProgressText({ newCount, interviewCount }) {
  const parts = []
  if (newCount) parts.push(`${newCount} ${newCount === 1 ? 'nuevo' : 'nuevos'}`)
  if (interviewCount) parts.push(`${interviewCount} en entrevista`)
  return parts.join(' · ') || 'Sin candidatos en curso'
}

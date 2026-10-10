import { BadgeCheck, CalendarDays, House, ListTodo, Users } from 'lucide-react'

// Secciones de la app. En el ordenador, todas en la barra lateral; en el móvil, las principales en
// la barra inferior y el resto dentro de "Más". Las vacantes están dentro de Equipo, en cada departamento.
// El informe (sección 'report') no está en el menú: se abre desde «Tu semana» en Inicio y cuenta
// como parte de Inicio (ver sectionActive).
export const MAIN_SECTIONS = [
  { id: 'home', label: 'Inicio', Icon: House },
  { id: 'calendar', label: 'Calendario', Icon: CalendarDays },
  { id: 'tasks', label: 'Tareas', Icon: ListTodo },
  { id: 'contacts', label: 'Contactos', Icon: Users },
]

export const MORE_SECTIONS = [
  { id: 'team', label: 'Equipo', Icon: BadgeCheck },
]

export const SECTIONS = [...MAIN_SECTIONS, ...MORE_SECTIONS]

// ¿Se marca la sección `id` en el menú estando en `section`? (el informe, como Inicio)
export function sectionActive(id, section) {
  return id === section || (id === 'home' && section === 'report')
}

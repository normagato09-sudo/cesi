import { BadgeCheck, BarChart3, Briefcase, CalendarDays, House, ListTodo, Users } from 'lucide-react'

// Secciones de la app. En el ordenador, todas en la barra lateral; en el móvil, las principales en
// la barra inferior y el resto dentro de "Más".
export const MAIN_SECTIONS = [
  { id: 'home', label: 'Inicio', Icon: House },
  { id: 'calendar', label: 'Calendario', Icon: CalendarDays },
  { id: 'tasks', label: 'Tareas', Icon: ListTodo },
  { id: 'contacts', label: 'Contactos', Icon: Users },
]

export const MORE_SECTIONS = [
  { id: 'team', label: 'Equipo', Icon: BadgeCheck },
  { id: 'vacancies', label: 'Vacantes', Icon: Briefcase },
  { id: 'report', label: 'Resumen', Icon: BarChart3 },
]

export const SECTIONS = [...MAIN_SECTIONS, ...MORE_SECTIONS]

import { BadgeCheck, CalendarDays, GraduationCap, House, KeyRound, ListTodo, Users } from 'lucide-react'

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
  { id: 'students', label: 'Alumnos', Icon: GraduationCap },
]

export const SECTIONS = [...MAIN_SECTIONS, ...MORE_SECTIONS]

// Accesos (cuentas y papeles): solo con la sincronización activa, que solo tiene la ceo.
export const ACCESS_SECTION = { id: 'access', label: 'Accesos', Icon: KeyRound }

export function moreSections(showAccess) {
  return showAccess ? [...MORE_SECTIONS, ACCESS_SECTION] : MORE_SECTIONS
}

// ¿Se marca la sección `id` en el menú estando en `section`? (el informe, como Inicio)
export function sectionActive(id, section) {
  return id === section || (id === 'home' && section === 'report')
}

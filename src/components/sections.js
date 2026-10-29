import {
  BadgeCheck,
  BookOpen,
  Briefcase,
  CalendarDays,
  CalendarSearch,
  ClipboardCheck,
  Clock,
  GraduationCap,
  House,
  KeyRound,
  LayoutDashboard,
  ListTodo,
  Users,
} from 'lucide-react'

// Menú de la app por grupos. En el ordenador, la barra lateral con los grupos como títulos; en el
// móvil, la barra inferior con un botón por grupo (si tiene varias pantallas, al pulsarlo se
// eligen) y «Más» con las acciones sueltas.
// El informe (sección 'report') no está en el menú: se abre desde «Tu semana» en Inicio y cuenta
// como parte de Inicio (ver sectionActive).
// `screen`: pantalla de los permisos del equipo (ver lib/permissions.js); `ceoOnly`: solo la ceo.
export const NAV_GROUPS = [
  {
    id: 'panel',
    label: 'Mi panel',
    Icon: LayoutDashboard,
    items: [
      { id: 'home', label: 'Inicio', Icon: House },
      { id: 'tasks', label: 'Tareas', Icon: ListTodo },
    ],
  },
  {
    id: 'agenda',
    label: 'Agenda',
    Icon: CalendarDays,
    items: [
      { id: 'calendar', label: 'Calendario', Icon: CalendarDays, screen: 'calendario' },
      { id: 'contacts', label: 'Contactos', Icon: Users, screen: 'contactos' },
      { id: 'slots', label: 'Buscar hueco', Icon: CalendarSearch, screen: 'huecos' },
    ],
  },
  {
    id: 'people',
    label: 'Equipo',
    Icon: BadgeCheck,
    items: [
      { id: 'team', label: 'Personas', Icon: BadgeCheck, screen: 'equipo' },
      { id: 'vacancies', label: 'Vacantes', Icon: Briefcase, screen: 'vacantes' },
      { id: 'clockins', label: 'Fichajes', Icon: Clock, screen: 'fichajes' },
      { id: 'access', label: 'Accesos', Icon: KeyRound, ceoOnly: true },
    ],
  },
  {
    id: 'training',
    label: 'Formación',
    Icon: GraduationCap,
    items: [
      { id: 'courses', label: 'Cursos', Icon: BookOpen, screen: 'cursos' },
      { id: 'students', label: 'Alumnos', Icon: GraduationCap, screen: 'alumnos' },
      { id: 'attendance', label: 'Asistencia', Icon: ClipboardCheck, screen: 'asistencia' },
    ],
  },
]

// Menú de la ceo. Accesos solo con la sincronización activa (sin Supabase no hay cuentas).
export function ceoGroups(showAccess) {
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((item) => showAccess || item.id !== 'access') }))
}

// Menú de una persona de equipo: «Mi panel» y las pantallas a las que tiene permiso.
// levels: { pantalla: 'none' | 'read' | 'write' }.
export function memberGroups(levels = {}) {
  return NAV_GROUPS.map((g) =>
    g.id === 'panel'
      ? { ...g, items: [{ id: 'home', label: 'Mi panel', Icon: LayoutDashboard }] }
      : { ...g, items: g.items.filter((item) => !item.ceoOnly && item.screen && levels[item.screen] && levels[item.screen] !== 'none') },
  ).filter((g) => g.items.length > 0)
}

export function allItems(groups) {
  return groups.flatMap((g) => g.items)
}

// ¿Se marca la sección `id` en el menú estando en `section`? (el informe, como Inicio)
export function sectionActive(id, section) {
  return id === section || (id === 'home' && section === 'report')
}

// Grupo en el que está `section` (para marcarlo en el móvil).
export function groupOfSection(groups, section) {
  return groups.find((g) => g.items.some((item) => sectionActive(item.id, section))) || null
}

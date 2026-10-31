import {
  BadgeCheck,
  BookOpen,
  Briefcase,
  CalendarDays,
  ClipboardCheck,
  Clock,
  GraduationCap,
  Handshake,
  House,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  ListTodo,
  SquareKanban,
  Target,
  UserRound,
  Users,
} from 'lucide-react'
import { boardOf } from '../lib/boards'

// Menú de la app por grupos. En el ordenador, la barra lateral con los grupos como títulos; en el
// móvil, la barra inferior con un botón por grupo (si tiene varias pantallas, al pulsarlo se
// eligen) y «Más» con las acciones sueltas.
// El informe (sección 'report') no está en el menú: se abre desde «Tu semana» en Inicio y cuenta
// como parte de Inicio (ver sectionActive).
// `screen`: pantalla de los permisos del equipo (ver lib/permissions.js); `ceoOnly`: solo la ceo;
// `needsSync`: solo con la sincronización activa (sin Supabase no hay cuentas ni perfil);
// `areas`: en el equipo, solo para esas áreas (además del permiso de `screen`).
export const NAV_GROUPS = [
  {
    id: 'panel',
    label: 'Mi panel',
    Icon: LayoutDashboard,
    items: [
      { id: 'home', label: 'Inicio', Icon: House },
      { id: 'profile', label: 'Mi perfil', Icon: UserRound, ceoOnly: true, needsSync: true },
    ],
  },
  {
    id: 'agenda',
    label: 'Agenda',
    Icon: CalendarDays,
    items: [
      { id: 'calendar', label: 'Calendario', Icon: CalendarDays, screen: 'calendario' },
      { id: 'contacts', label: 'Contactos externos', Icon: Users, screen: 'contactos' },
      { id: 'alliances', label: 'Alianzas', Icon: Handshake, screen: 'contactos', areas: ['alianzas', 'direccion'] },
    ],
  },
  {
    id: 'people',
    label: 'Equipo',
    Icon: BadgeCheck,
    items: [
      { id: 'team', label: 'Equipo', Icon: BadgeCheck, screen: 'equipo' },
      { id: 'vacancies', label: 'Vacantes', Icon: Briefcase, screen: 'vacantes' },
      { id: 'team-tasks', label: 'Tareas', Icon: ListChecks, ceoOnly: true, needsSync: true },
      { id: 'goals', label: 'Objetivos', Icon: Target, ceoOnly: true, needsSync: true },
      { id: 'boards', label: 'Tableros', Icon: SquareKanban, ceoOnly: true, needsSync: true },
      { id: 'clockins', label: 'Fichajes', Icon: Clock, screen: 'fichajes' },
      { id: 'access', label: 'Accesos', Icon: KeyRound, ceoOnly: true, needsSync: true },
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

// Menú de la ceo. Mi perfil y Accesos solo con la sincronización activa.
export function ceoGroups(withSync) {
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((item) => withSync || !item.needsSync) }))
}

// Menú de una persona de equipo: «Mi panel», su «Calendario» (el compartido), «Tareas» (las del
// equipo), «Objetivos» (los del mes de su área), el tablero de su área (si tiene; Directivo,
// «Tableros») y «Fichaje», siempre; y las pantallas a las que tiene permiso. Mi calendario
// (permiso 'calendario') y mis Fichajes (permiso 'fichajes') no salen: el calendario aún no lo ve
// nadie del equipo, y los fichajes de todos los ve Directivo desde su «Fichaje».
// levels: { pantalla: 'none' | 'read' | 'write' }; area: la de la persona.
export function memberGroups(levels = {}, area = null) {
  return NAV_GROUPS.map((g) =>
    g.id === 'panel'
      ? {
          ...g,
          items: [
            { id: 'home', label: 'Mi panel', Icon: LayoutDashboard },
            { id: 'shared-calendar', label: 'Calendario', Icon: CalendarDays },
            { id: 'team-tasks', label: 'Tareas', Icon: ListTodo },
            { id: 'goals', label: 'Objetivos', Icon: Target },
            // El tablero de su área (con su nombre) o, en Directivo, «Tableros» (todos).
            ...(boardOf(area) ? [{ id: 'board', label: boardOf(area).title, Icon: SquareKanban }] : []),
            ...(area === 'direccion' ? [{ id: 'boards', label: 'Tableros', Icon: SquareKanban }] : []),
            { id: 'clock', label: 'Fichaje', Icon: Clock },
          ],
        }
      : {
          ...g,
          items: g.items.filter(
            (item) =>
              !item.ceoOnly &&
              (!item.areas || item.areas.includes(area)) &&
              item.id !== 'calendar' &&
              item.id !== 'clockins' &&
              item.screen &&
              levels[item.screen] &&
              levels[item.screen] !== 'none',
          ),
        },
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

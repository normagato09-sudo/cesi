import {
  Award,
  BadgeCheck,
  Briefcase,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  Clock,
  GraduationCap,
  Handshake,
  History,
  Inbox,
  House,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  ListTodo,
  Megaphone,
  MessageCircle,
  Newspaper,
  Star,
  SquareKanban,
  Target,
  UserRound,
  Users,
  Wallet,
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
      { id: 'messages', label: 'Mensajes', Icon: MessageCircle, ceoOnly: true, needsSync: true },
      { id: 'newsletter', label: 'Newsletter', Icon: Newspaper, ceoOnly: true, needsSync: true },
      { id: 'mailbox', label: 'Buzón', Icon: Inbox, ceoOnly: true, needsSync: true },
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
      { id: 'alliances', label: 'Alianzas', Icon: Handshake, screen: 'contactos', areas: ['alianzas'] },
    ],
  },
  {
    id: 'people',
    label: 'Equipo',
    Icon: BadgeCheck,
    items: [
      { id: 'team-tasks', label: 'Tareas', Icon: ListChecks, ceoOnly: true, needsSync: true },
      // Vacantes (parte 38): la ceo aquí; Directivo y RRHH, en «Mi panel».
      { id: 'vacancies', label: 'Vacantes', Icon: Briefcase, ceoOnly: true },
      { id: 'goals', label: 'Objetivos', Icon: Target, ceoOnly: true, needsSync: true },
      { id: 'boards', label: 'Tableros', Icon: SquareKanban, ceoOnly: true, needsSync: true },
      { id: 'notices', label: 'Avisos', Icon: Megaphone, ceoOnly: true, needsSync: true },
      { id: 'finance', label: 'Finanzas', Icon: Wallet, ceoOnly: true, needsSync: true },
      { id: 'clockins', label: 'Fichajes', Icon: Clock, screen: 'fichajes' },
      { id: 'access', label: 'Accesos', Icon: KeyRound, ceoOnly: true, needsSync: true },
      { id: 'team-edits', label: 'Cambios del equipo', Icon: History, ceoOnly: true, needsSync: true },
    ],
  },
  {
    id: 'training',
    label: 'Formación',
    Icon: GraduationCap,
    items: [
      { id: 'courses', label: 'Cursos', Icon: BookOpen, screen: 'cursos' },
      { id: 'students', label: 'Alumnos', Icon: GraduationCap, screen: 'alumnos' },
      // Testimonios: en mi menú aquí; en el del equipo, en «Mi panel» (todos).
      { id: 'testimonials', label: 'Testimonios', Icon: Star, ceoOnly: true, needsSync: true },
      // Certificados (parte 43): solo la ceo (nadie del equipo, ni Directivo).
      { id: 'certificates', label: 'Certificados', Icon: Award, ceoOnly: true, needsSync: true },
      { id: 'attendance', label: 'Asistencia', Icon: ClipboardCheck, screen: 'asistencia' },
    ],
  },
]

// Pantallas que no salen en el menú de la ceo (las siguen usando sus áreas; la asistencia la ve en
// cada curso) y los nombres que cambian para ella.
const CEO_HIDDEN = new Set(['alliances', 'boards', 'finance', 'attendance'])
const CEO_LABELS = { contacts: 'Mis contactos' }

// Menú de la ceo. Mi perfil y Accesos solo con la sincronización activa.
export function ceoGroups(withSync) {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items
      .filter((item) => !CEO_HIDDEN.has(item.id) && (withSync || !item.needsSync))
      .map((item) => (CEO_LABELS[item.id] ? { ...item, label: CEO_LABELS[item.id] } : item)),
  }))
}

// Menú de una persona de equipo: «Mi panel», «Mensajes», «Avisos», su «Calendario» (el
// compartido), «Tareas» (las del equipo), «Objetivos» (los del mes de su área), el tablero de su
// área (si tiene), «Contactos» (los suyos) y «Fichaje», siempre; y las pantallas a las que tiene
// permiso (Directivo nunca Asistencia: la ve en cada curso). «Mis cursos» (apuntarse como alumno) y Vacantes (Directivo y RRHH las gestionan; el resto se postula) salen siempre. Mi calendario (permiso 'calendario') y mis Fichajes (permiso
// 'fichajes') no salen: el calendario aún no lo ve nadie del equipo, y los fichajes de todos los
// ve Directivo desde su «Fichaje».
// levels: { pantalla: 'none' | 'read' | 'write' }; area: la de la persona.
// Pantallas que Directivo no ve aunque tuviera permiso (parte 27).
const DIRECTIVO_HIDDEN = new Set(['attendance'])

export function memberGroups(levels = {}, area = null) {
  return NAV_GROUPS.map((g) =>
    g.id === 'panel'
      ? {
          ...g,
          items: [
            { id: 'home', label: 'Mi panel', Icon: LayoutDashboard },
            { id: 'messages', label: 'Mensajes', Icon: MessageCircle },
            { id: 'notices', label: 'Avisos', Icon: Megaphone },
            { id: 'newsletter', label: 'Newsletter', Icon: Newspaper },
            { id: 'mailbox', label: 'Buzón', Icon: Inbox },
            { id: 'shared-calendar', label: 'Calendario', Icon: CalendarDays },
            { id: 'team-tasks', label: 'Tareas', Icon: ListTodo },
            // Mis cursos (parte 39): se apuntan a los cursos abiertos como los alumnos.
            { id: 'my-courses', label: 'Mis cursos', Icon: GraduationCap },
            // Vacantes: Directivo y RRHH las gestionan; el resto, se postula a las abiertas.
            { id: 'vacancies', label: 'Vacantes', Icon: Briefcase },
            { id: 'testimonials', label: 'Testimonios', Icon: Star },
            { id: 'goals', label: 'Objetivos', Icon: Target },
            // El tablero de su área (con su nombre).
            ...(boardOf(area) ? [{ id: 'board', label: boardOf(area).title, Icon: SquareKanban }] : []),
            // Finanzas: solo el área Finanzas.
            ...(area === 'finanzas' ? [{ id: 'finance', label: 'Finanzas', Icon: Wallet }] : []),
            { id: 'clock', label: 'Fichaje', Icon: Clock },
          ],
        }
      : {
          ...g,
          items: g.items
            .filter(
              (item) =>
                !item.ceoOnly &&
                (!item.areas || item.areas.includes(area)) &&
                item.id !== 'calendar' &&
                item.id !== 'clockins' &&
                !(area === 'direccion' && DIRECTIVO_HIDDEN.has(item.id)) &&
                // «Contactos» (los suyos) lo tiene todo el equipo; lo demás, con permiso.
                (item.id === 'contacts' || (item.screen && levels[item.screen] && levels[item.screen] !== 'none')),
            )
            .map((item) => (item.id === 'contacts' ? { ...item, label: 'Contactos' } : item)),
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

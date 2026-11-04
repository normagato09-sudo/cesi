import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { addDays, format, subDays } from 'date-fns'
import { Clock, Eye } from 'lucide-react'
import Sidebar from './components/Sidebar.jsx'
import MobileNav from './components/MobileNav.jsx'
import ProfileReminder from './components/ProfileReminder.jsx'
import { useMyProfile } from './components/useMyProfile'
import { usePublishCeoBusy, useSharedMeetings } from './hooks/useSharedMeetings'
import { keyOf, sharedEventsForCalendar } from './lib/sharedCalendar'
import { eventsInZone, fromWall, realEvent, toWall, viewZone } from './lib/zoneView'
import { profileWorkingHours } from './lib/availability'
import CalendarHeader from './components/CalendarHeader.jsx'
import MonthView from './components/CalendarView/MonthView.jsx'
import { PreviewMeContext } from './components/CalendarView/previewContext'
import WeekView from './components/CalendarView/WeekView.jsx'
import DayView from './components/CalendarView/DayView.jsx'
import EventModal from './components/EventModal.jsx'
import FindSlotModal from './components/FindSlotModal.jsx'
import AllianceShare from './components/alliances/AllianceShare.jsx'
import RecurrenceScopeDialog from './components/RecurrenceScopeDialog.jsx'
import MeetingWarningDialog from './components/MeetingWarningDialog.jsx'
import { meetingsWithUnavailable, unavailableWarning } from './lib/unavailableParticipants.js'
import {
  STORAGE_KEY as PROPOSALS_KEY,
  getAllProposals,
  isExpired,
  optionsOf,
  proposalsStore,
} from './lib/proposals.js'
import { useLocalCalendar } from './hooks/useLocalCalendar.js'
import { useContacts } from './hooks/useContacts.js'
import { useStoredValue } from './hooks/useStoredValue.js'
import { SchedulingContext } from './lib/schedulingContext.js'
import { MeetingWarningError } from './lib/meetingWarnings.js'
import { dateKey, exceptionOf, expandEvent } from './lib/recurrence.js'
import {
  SCOPES,
  cancelOccurrencePatch,
  editOccurrencePatch,
  editSeriesPatch,
  occurrenceKeyOf,
  restoreOccurrencePatch,
  seriesDayDelta,
  splitSeries,
  truncateSeriesPatch,
} from './lib/seriesEdits.js'
import { meetingsMissingNotes } from './lib/notes.js'
import { sessionPatch, toSeriesSessionPatch } from './lib/meetingSession.js'
import { getAllEvents } from './lib/localEvents.js'
import { deleteContactFiles } from './lib/files/contactFiles.js'
import { AREAS_KEY, getStoredTeamAreas, isActiveMember, saveTeamAreas } from './lib/team.js'
import { useChatUnread } from './components/chat/useChatUnread.js'
import { useScheduleAutopilot } from './components/useScheduleAutopilot.js'
import { archivePatch, unarchivePatch } from './lib/archive.js'
import { resolveDepartments } from './lib/departments.js'
import { useSync, useSyncStatus } from './lib/sync/syncContext.js'
import { useViewAs } from './components/viewAs/viewAsContext.js'
import { runPendingMigrations } from './lib/dataMigrations.js'
import { STORAGE_KEY as GROUPS_KEY, contactsWithoutGroup, getAllGroups, groupsStore } from './lib/groups.js'
import { STORAGE_KEY as STUDENTS_KEY, createStudent, deleteStudent, getAllStudents, updateStudent } from './lib/students.js'
import { fichaPatch, listPortalsByStudent } from './lib/studentPortal.js'
import { STORAGE_KEY as COURSES_KEY, coursesStore, deleteCourse, getAllCourses, validateCourse } from './lib/courses.js'
import {
  ATTENDANCE_KEY,
  EXTRA_CLASSES_KEY,
  deleteExtraClass,
  getAllAttendance,
  getAllExtraClasses,
  markAllPresent,
  markAttendance,
  removeCourseAttendance,
  removeStudentAttendance,
  saveExtraClass,
  setAttendanceTimes,
  setJustification,
  setLateMinutes,
  unmarkAttendance,
} from './lib/attendance.js'
import { STORAGE_KEY as VACANCIES_KEY, getAllVacancies, interviewUpdates, isCandidateOnly } from './lib/vacancies.js'
// Mis tareas personales antiguas (tasks): ya no salen en ningún sitio (las tareas son las del
// equipo, team_tasks); se siguen guardando y sincronizando tal cual, sin borrar nada.
import { STORAGE_KEY as TASKS_KEY, getAllTasks, taskSourcePatches, tasksStore } from './lib/tasks.js'
import { getVisibleRange } from './lib/dateHelpers.js'
import { headerLabel, readView, stepDate, writeView } from './lib/calendarNav.js'
import { useMediaQuery } from './lib/useMediaQuery.js'
import { computeSummary } from './lib/summary.js'
import { STORAGE_KEY as WEEKLY_AVAILABILITY_KEY, getAllWeeklyAvailability } from './lib/weeklyAvailability.js'
import { DAY_END_MINUTES } from './lib/weeklySchedule.js'
import { contactDataFromText, participantFields, participantsOf } from './lib/contacts.js'
import { addAllianceNote, allianceOf, applyAllianceSave, listAlliancePeople, removeAllianceNote } from './lib/alliances.js'
import './App.css'

// Las secciones y los modales que no hacen falta al abrir el calendario se cargan aparte,
// la primera vez que se usan (el service worker los guarda para usarlos sin conexión).
const ContactsView = lazy(() => import('./components/ContactsView.jsx'))
const StudentsView = lazy(() => import('./components/StudentsView.jsx'))
const AccessView = lazy(() => import('./components/AccessView.jsx'))
const MyProfileView = lazy(() => import('./components/MyProfileView.jsx'))
const MeetingDetailModal = lazy(() => import('./components/shared/MeetingDetailModal.jsx'))
const MeetingFormModal = lazy(() => import('./components/shared/MeetingFormModal.jsx'))
// Yo, para las tareas del equipo y los fichajes (veo y gestiono todo).
const CEO_ME = (id) => ({ id, role: 'ceo', area: null, boss: true })
const TeamTasksView = lazy(() => import('./components/team/TeamTasksView.jsx'))
const GoalsView = lazy(() => import('./components/team/GoalsView.jsx'))
const BoardsView = lazy(() => import('./components/boards/BoardsView.jsx'))
const NoticesView = lazy(() => import('./components/notices/NoticesView.jsx'))
const FinanceView = lazy(() => import('./components/finance/FinanceView.jsx'))
const TeamEditsView = lazy(() => import('./components/TeamEditsView.jsx'))
const MessagesView = lazy(() => import('./components/chat/MessagesView.jsx'))
const OrgChartView = lazy(() => import('./components/OrgChartView.jsx'))
const TestimonialsView = lazy(() => import('./components/TestimonialsView.jsx'))
const NewsletterView = lazy(() => import('./components/NewsletterView.jsx'))
const MailboxView = lazy(() => import('./components/MailboxView.jsx'))
const AlliancesView = lazy(() => import('./components/alliances/AlliancesView.jsx'))
const AlliancePanel = lazy(() => import('./components/alliances/AlliancePanel.jsx'))
const NewTeamTaskModal = lazy(() => import('./components/team/NewTeamTaskModal.jsx'))
const ClockView = lazy(() => import('./components/team/ClockView.jsx'))
const CeoHome = lazy(() => import('./components/CeoHome.jsx'))
const AttendanceView = lazy(() => import('./components/AttendanceView.jsx'))
const ComingSoonView = lazy(() => import('./components/ComingSoonView.jsx'))
const ReportView = lazy(() => import('./components/ReportView.jsx'))
const ProposalModal = lazy(() => import('./components/ProposalModal.jsx'))
const BackupModal = lazy(() => import('./components/BackupModal.jsx'))

// Mientras llega el código de una sección: un aviso discreto que solo se ve si tarda.
function SectionLoading() {
  return (
    <div className="app-section-loading" role="status">
      Cargando…
    </div>
  )
}

// Pantallas quitadas (Equipo y Vacantes): si se intenta abrir una, se va a Inicio.
const REMOVED_SECTIONS = new Set(['team', 'vacancies'])

// Rango compacto, p. ej. "23–25 sept 2026", "30 sept – 2 oct 2026" o "30 dic 2026 – 1 ene 2027".
export default function App() {
  // Se abre en Inicio.
  const [section, setSection] = useState('home')
  const [selectedContactId, setSelectedContactId] = useState(null)
  const [selectedStudentId, setSelectedStudentId] = useState(null)
  // «Enviar mensaje» desde el Organigrama: Mensajes se abre con el chat de esa cuenta.
  const [messagesWith, setMessagesWith] = useState(null)
  // Vista del calendario: la última que elegí en este dispositivo.
  const [view, setViewState] = useState(() => readView())
  const setView = (next) => {
    writeView(next)
    setViewState(next)
  }
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [selectedEvent, setSelectedEvent] = useState(null)
  // true si la reunión se abrió para escribir las notas (desde "Sin notas").
  const [notesFocus, setNotesFocus] = useState(false)
  // Reunión (id de la ocurrencia) que se abre con el mensaje de convocatoria ("Yo no asisto").
  const [convocationFor, setConvocationFor] = useState(null)
  // «Nueva reunión» (el único formulario): { meeting } (reunión compartida mía), { editingEvent,
  // scope } (un evento mío) o { prefill } (una nueva; prefill.source: un evento que se duplica).
  const [formModal, setFormModal] = useState(null)
  // null = cerrado; { participants, interview, ... } = abierto, con los participantes iniciales
  // si los hay. Sirve para recolocar una reunión (desde los avisos) y desde mi formulario de eventos.
  const [findSlot, setFindSlot] = useState(null)
  const [backupOpen, setBackupOpen] = useState(false)
  const [proposalModalId, setProposalModalId] = useState(null)
  // Pregunta "¿Solo este día, este y los siguientes o toda la serie?": { action, title, resolve }.
  const [scopeAsk, setScopeAsk] = useState(null)
  // Tarea abierta: null = cerrada; { task } para editarla o { initial } para crear una nueva.
  // Tarea nueva del equipo desde el acta de una reunión: { title, description } o null.
  const [teamTaskDraft, setTeamTaskDraft] = useState(null)
  // Aviso al mover o redimensionar: { violations, resolve } (resolve: 'save' | 'find' | null).
  const [moveWarning, setMoveWarning] = useState(null)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(id)
  }, [])

  // En móvil la vista Semana muestra solo COMPACT_WEEK_DAYS días a partir de currentDate.
  const compactWeek = useMediaQuery('(max-width: 640px)')

  // Un día más a cada lado: el calendario se ve en la zona de mi perfil, que puede no ser la del
  // dispositivo.
  const range = useMemo(() => {
    const r = getVisibleRange(currentDate, view, { compactWeek })
    return { start: subDays(r.start, 1), end: addDays(r.end, 1) }
  }, [currentDate, view, compactWeek])

  const {
    rawEvents,
    events,
    workingHours: storedWorkingHours,
    checkConflict,
    addEvent,
    editEvent,
    removeEvent,
    reloadAll: reloadCalendar,
  } = useLocalCalendar(range)

  const { contacts, addContact, editContact, removeContact: removeContactOnly, refresh: reloadContacts } = useContacts()

  // Al borrar un contacto se borran también su foto y su CV.
  const removeContact = (id) => {
    const contact = contacts.find((c) => c.id === id)
    removeContactOnly(id)
    if (contact) deleteContactFiles(contact)
  }
  const [proposals, reloadProposals] = useStoredValue(PROPOSALS_KEY, getAllProposals)
  const [groups, reloadGroups] = useStoredValue(GROUPS_KEY, getAllGroups)
  const [storedAreas, reloadTeamAreas] = useStoredValue(AREAS_KEY, getStoredTeamAreas)
  // weekly_availability (la antigua «Disponibilidad de la semana») ya no se usa; se sigue
  // sincronizando tal cual, sin borrar nada.
  const [, reloadWeeklyAvailability] = useStoredValue(WEEKLY_AVAILABILITY_KEY, getAllWeeklyAvailability)
  const [vacancies, reloadVacancies] = useStoredValue(VACANCIES_KEY, getAllVacancies)
  const [, reloadTasks] = useStoredValue(TASKS_KEY, getAllTasks)
  const [students, reloadStudents] = useStoredValue(STUDENTS_KEY, getAllStudents)
  const [courses, reloadCourses] = useStoredValue(COURSES_KEY, getAllCourses)
  const [attendance, reloadAttendance] = useStoredValue(ATTENDANCE_KEY, getAllAttendance)
  const [extraClasses, reloadExtraClasses] = useStoredValue(EXTRA_CLASSES_KEY, getAllExtraClasses)

  // Vuelve a leer todos los datos guardados (tras importar una copia o una migración).
  const reloadAllData = () => {
    reloadCalendar()
    reloadContacts()
    reloadProposals()
    reloadGroups()
    reloadTeamAreas()
    reloadWeeklyAvailability()
    reloadVacancies()
    reloadTasks()
    reloadStudents()
    reloadCourses()
    reloadAttendance()
    reloadExtraClasses()
  }

  // Áreas del equipo: lista fija (las 10 áreas de las cuentas; ver departments.js). Esa lista se guarda (y se sincroniza) solo cuando ya se ha descargado la nube, para no pisar
  // con la lista de ejemplo de este dispositivo una lista ya cambiada en otro.
  const sync = useSync()

  // Perfiles del portal de los alumnos con cuenta unida a su ficha (Map id del alumno → perfil).
  // Se leen al abrir Alumnos; sin el SQL del portal, vacío.
  const [portals, setPortals] = useState(() => new Map())
  const syncClient = sync?.client || null
  useEffect(() => {
    if (!syncClient || section !== 'students') return
    let active = true
    listPortalsByStudent(syncClient).then(
      (next) => active && setPortals(next),
      () => {},
    )
    return () => {
      active = false
    }
  }, [syncClient, section])
  // Mi perfil (account_profiles), como el de equipo y alumnos: no me bloquea la app; si no está
  // completo, Inicio lo recuerda.
  const myProfile = useMyProfile(syncClient, sync?.userId || null)
  const myProfileMissing = !!myProfile.data && !myProfile.data.profile?.completed_at
  // Todo se ve en la zona de mi perfil (si no está completo, en la del dispositivo).
  const myZone = viewZone(myProfile.data?.profile)
  // «Organizar horario» de los cursos y su recálculo al abrir la app (con la sincronización).
  const scheduler = useMemo(
    () =>
      syncClient
        ? {
            client: syncClient,
            zone: myZone,
            save: (course, patch) => {
              coursesStore.update(course.id, patch)
              reloadCourses()
            },
          }
        : null,
    [syncClient, myZone, reloadCourses],
  )
  useScheduleAutopilot(scheduler, courses, students)
  // Mi disponibilidad: la de mi perfil; sin perfil completo, el horario guardado de antes.
  const workingHours = useMemo(
    () => profileWorkingHours(myProfile.data?.profile) || storedWorkingHours,
    [myProfile.data, storedWorkingHours],
  )

  // Calendario compartido: sus reuniones salen también en mi calendario (en morado, «Compartida»),
  // leídas aparte de mis eventos; y mis bloques ocupados se publican (solo horas) para el
  // libre/ocupado de los demás.
  const sharedMeetings = useSharedMeetings(syncClient, range)
  const calendarEvents = useMemo(() => {
    const shared = sharedEventsForCalendar(sharedMeetings.rows)
    return shared.length > 0 ? [...events, ...shared] : events
  }, [events, sharedMeetings.rows])
  // Lo que se ve en Mes, Semana y Día: en la zona de mi perfil (ver zoneView.js).
  const zonedEvents = useMemo(() => eventsInZone(calendarEvents, myZone), [calendarEvents, myZone])
  const [sharedOpen, setSharedOpen] = useState(null) // reunión compartida abierta
  usePublishCeoBusy(syncClient, rawEvents, now)
  const syncStatus = useSyncStatus()
  const viewAs = useViewAs()
  const canSaveDepartments = !sync || syncStatus.status === 'synced'
  useEffect(() => {
    if (!canSaveDepartments) return
    // Migraciones únicas de datos (departamentos; antiguos miembros al archivo).
    if (runPendingMigrations().length > 0) {
      reloadAllData()
      return
    }
    const { list, changed } = resolveDepartments(getStoredTeamAreas())
    if (changed) {
      saveTeamAreas(list)
      reloadTeamAreas()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reloadAllData cambia en cada render
  }, [canSaveDepartments, storedAreas, contacts, vacancies, reloadTeamAreas])

  const scheduling = useMemo(
    () => ({
      rawEvents,
      workingHours,
      bookingRequests: [],
      contacts,
      addContact,
      proposals,
      groups,
    }),
    [rawEvents, workingHours, contacts, addContact, proposals, groups],
  )

  // Propuestas pendientes para la barra lateral, con sus opciones y si han caducado.
  const proposalItems = useMemo(
    () =>
      proposals
        .map((proposal) => {
          const options = optionsOf(proposal, rawEvents)
          const { contacts: people, guests } = participantsOf(proposal, contacts)
          const who = [...people.map((c) => c.name.split(' ')[0]), ...guests].join(', ')
          return { proposal, options, expired: isExpired(options, now), who }
        })
        .sort((a, b) => (a.options[0]?.start || 0) - (b.options[0]?.start || 0)),
    [proposals, rawEvents, contacts, now],
  )

  // Crea la propuesta y una reunión provisional por cada opción elegida.
  const handleCreateProposal = ({ slots, ...data }) => {
    const proposal = proposalsStore.create(data)
    const people = data.participantIds.map((id) => contacts.find((c) => c.id === id)).filter(Boolean)
    const options = slots.map((slot) =>
      addEvent({
        title: data.title,
        ...(data.interview ? { interview: true } : {}),
        ...participantFields(people, data.guests),
        description: '',
        meetLink: '',
        isUnavailable: false,
        allDay: false,
        recurrence: null,
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        provisional: true,
        proposalId: proposal.id,
        notAttending: !!data.notAttending,
      }),
    )
    reloadProposals()
    return { proposal, options }
  }

  const removeProposal = (proposalId, keepEventId = null) => {
    for (const ev of rawEvents) {
      if (ev.proposalId === proposalId && ev.id !== keepEventId) removeEvent(ev.id)
    }
    proposalsStore.remove(proposalId)
    reloadProposals()
  }

  // La opción elegida pasa a ser una reunión normal y se borran las demás.
  const handleConfirmOption = (option) => {
    const id = option.seriesId || option.id
    editEvent(id, { provisional: false, proposalId: null })
    applyInterviewUpdates(option)
    removeProposal(option.proposalId, id)
    // Si la organizo sin asistir, se abre con la convocatoria lista para enviar.
    if (option.notAttending) {
      setSelectedEvent({ ...option, provisional: false, proposalId: null })
      setConvocationFor(option.id)
    } else {
      setSelectedEvent(null)
    }
  }

  const handleCancelProposal = (proposalId) => {
    removeProposal(proposalId)
    setSelectedEvent(null)
  }

  // Avisos que no bloquean: participantes que no pueden según su disponibilidad (los que no la
  // tienen apuntada no avisan). Las reglas y el margen guardados ya no se aplican.
  const warningsFor = (meeting) => [unavailableWarning(meeting, contacts)].filter(Boolean)

  // Quién no puede y se ha aceptado al guardar igualmente (para no volver a salir en "Pendientes").
  const acceptedUnavailableFor = (meeting) => unavailableWarning(meeting, contacts)?.contactIds || []

  // ---------------------------------------------------------------------------
  // Reuniones que se repiten: solo este día, este y los siguientes o toda la serie
  // ---------------------------------------------------------------------------

  // Pregunta a qué días se aplica el cambio. Devuelve el alcance (SCOPES) o null si se cancela.
  const askScope = (action, event) => new Promise((resolve) => setScopeAsk({ action, title: event.title, resolve }))

  const seriesOf = (occurrence) => getAllEvents().find((ev) => ev.id === occurrence.seriesId) || null

  // Qué se ignora al comprobar solapes: solo ese día o toda la serie.
  const excludeFor = (event, scope) => (scope === SCOPES.THIS ? { excludeId: event.id } : { excludeSeriesId: event.seriesId })

  // Las tareas de una reunión siguen a su sesión si la reunión cambia de día, se parte o deja de
  // (o empieza a) repetirse.
  const moveTasks = (change) => {
    const patches = taskSourcePatches(getAllTasks(), change)
    if (patches.length === 0) return
    for (const { id, patch } of patches) tasksStore.update(id, patch)
    reloadTasks()
  }

  // Guarda `changes` ({ start, end, title, ... }) en la reunión de `occurrence` con ese alcance.
  const applyOccurrenceChange = (occurrence, changes, scope) => {
    const series = seriesOf(occurrence)
    if (!series) return
    const iso = (d) => (d instanceof Date ? d.toISOString() : d)
    if (!series.recurrence) {
      const start = iso(changes.start ?? series.start)
      // Si pasa a repetirse, su agenda y su acta pasan a ser las de su primer día.
      const sessions = changes.recurrence ? toSeriesSessionPatch(series, start) : {}
      editEvent(series.id, { ...changes, ...sessions, start, end: iso(changes.end ?? series.end) })
      if (changes.recurrence) moveTasks({ kind: 'toSeries', eventId: series.id, key: dateKey(start) })
      return
    }
    if (scope === SCOPES.THIS) {
      editEvent(series.id, editOccurrencePatch(series, occurrence, changes))
      return
    }
    if (scope === SCOPES.FOLLOWING) {
      const split = splitSeries(series, occurrence, changes)
      if (split) {
        editEvent(series.id, split.seriesPatch)
        const newEvent = addEvent(split.newEvent)
        moveTasks({
          kind: 'split',
          eventId: series.id,
          key: occurrenceKeyOf(occurrence),
          newEventId: newEvent.id,
          dayDelta: seriesDayDelta(series, occurrence, changes),
          newIsSeries: !!split.newEvent.recurrence,
        })
        return
      }
    }
    editEvent(series.id, editSeriesPatch(series, occurrence, changes))
    if ('recurrence' in changes && !changes.recurrence) moveTasks({ kind: 'toSingle', eventId: series.id })
    else moveTasks({ kind: 'shift', eventId: series.id, dayDelta: seriesDayDelta(series, occurrence, changes) })
  }

  // "Volver a como era en la serie": quita los cambios de ese día y muestra el día como la serie.
  const handleRestoreOccurrence = (occurrence) => {
    const series = seriesOf(occurrence)
    if (!series) return
    const updated = editEvent(series.id, restoreOccurrencePatch(series, occurrence))
    const from = new Date(occurrence.originalStart)
    const restored = expandEvent(updated, from, new Date(from.getTime() + 1)).find((ev) => ev.id === occurrence.id)
    setSelectedEvent(restored || null)
  }

  const handleBackupRestored = () => {
    reloadAllData()
    setSelectedEvent(null)
    setSelectedContactId(null)
  }

  const missingNotes = useMemo(() => meetingsMissingNotes(rawEvents, now), [rawEvents, now])

  // "Pendientes": reuniones de los próximos 60 días con participantes que no pueden.
  const unavailableMeetings = useMemo(() => meetingsWithUnavailable(rawEvents, contacts, now), [rawEvents, contacts, now])

  // "Buscar otro hueco" para una reunión que ya existe: misma duración y participantes;
  // al elegir un hueco se mueve la reunión (en una serie, preguntando a qué días).
  const findSlotToReschedule = (occurrence) =>
    setFindSlot({
      participants: { participantIds: occurrence.participantIds || [], guests: occurrence.guests || [] },
      durationMinutes: Math.round((new Date(occurrence.end) - new Date(occurrence.start)) / 60000),
      notAttending: !!occurrence.notAttending,
      reschedule: occurrence,
    })

  // "Mantener así": se acepta que esas personas no pueden (en una serie, para toda la serie,
  // salvo que ese día tenga ya sus propios datos).
  const handleKeepUnavailable = ({ occurrence, people }) => {
    const series = seriesOf(occurrence)
    if (!series) return
    const ids = people.map((p) => p.contact.id)
    const merge = (list) => [...new Set([...(list || []), ...ids])]
    const own = series.recurrence && 'acceptedUnavailable' in (exceptionOf(series, occurrenceKeyOf(occurrence)) || {})
    if (own) editEvent(series.id, editOccurrencePatch(series, occurrence, { acceptedUnavailable: merge(occurrence.acceptedUnavailable) }))
    else editEvent(series.id, { acceptedUnavailable: merge(series.acceptedUnavailable) })
  }

  const openEvent = (event, { focusNotes = false } = {}) => {
    if (event.shared) {
      setSharedOpen(event.sharedMeeting)
      return
    }
    setSelectedEvent(event)
    setNotesFocus(focusNotes)
    setConvocationFor(null)
  }

  // Guarda la agenda y el acta de la ocurrencia ({ notes, agenda, decisions }, solo lo que cambia):
  // por día si la reunión se repite (notesByDate…), si no en la propia reunión.
  const handleSaveSession = (occurrence, changes) => {
    const series = getAllEvents().find((ev) => ev.id === occurrence.seriesId)
    if (!series) return
    editEvent(series.id, sessionPatch(series, occurrence, changes))
  }

  const summary = useMemo(
    () => computeSummary(rawEvents, workingHours, now),
    [rawEvents, workingHours, now],
  )

  const handleCreateGroup = (data) => {
    groupsStore.create(data)
    reloadGroups()
  }

  const handleUpdateGroup = (id, patch) => {
    groupsStore.update(id, patch)
    reloadGroups()
  }

  // Al borrar un grupo sus contactos se conservan: solo se les quita ese grupo.
  const handleDeleteGroup = (id) => {
    for (const { id: contactId, groupIds } of contactsWithoutGroup(id, contacts)) editContact(contactId, { groupIds })
    groupsStore.remove(id)
    reloadGroups()
  }

  // ---------------------------------------------------------------------------
  // Alumnos y cursos
  // ---------------------------------------------------------------------------

  const handleAddStudent = (data) => {
    const student = createStudent(data)
    reloadStudents()
    return student
  }

  const handleEditStudent = (id, patch) => {
    updateStudent(id, patch)
    reloadStudents()
  }

  // «Copiar a la ficha»: país, zona horaria y disponibilidad del portal del alumno.
  const handleCopyFromPortal = (studentId) => {
    const portal = portals.get(studentId)
    if (!portal) return
    try {
      handleEditStudent(studentId, fichaPatch(portal))
    } catch (err) {
      window.alert(`No se pudo copiar: ${err.message}`)
    }
  }

  // Con el alumno se borra su pase de lista.
  const handleRemoveStudent = (id) => {
    removeStudentAttendance(id)
    deleteStudent(id)
    reloadStudents()
    reloadAttendance()
  }

  const handleCreateCourse = (data) => {
    coursesStore.create(data)
    reloadCourses()
  }

  const handleRenameCourse = (id, name) => {
    coursesStore.update(id, { name })
    reloadCourses()
  }

  // Profesor, duración, clases por semana y horario (CourseFormModal).
  const handleUpdateCourse = (id, data) => {
    const problem = validateCourse(data, courses, id)
    if (problem) throw new Error(problem)
    coursesStore.update(id, data)
    reloadCourses()
  }

  // Al borrar un curso sus alumnos se conservan: solo se les quita ese curso. Su pase de lista y
  // sus clases sueltas se borran.
  const handleDeleteCourse = (id) => {
    removeCourseAttendance(id)
    deleteCourse(id)
    reloadCourses()
    reloadStudents()
    reloadAttendance()
    reloadExtraClasses()
  }

  // Alianzas (parte 16): el seguimiento va en mis contactos externos (se sincroniza como el resto
  // de la ficha); los responsables posibles, de Supabase.
  const [alliancePeople, setAlliancePeople] = useState([])
  useEffect(() => {
    if (!syncClient) return
    let active = true
    listAlliancePeople(syncClient).then(
      (rows) => active && setAlliancePeople(rows || []),
      () => {},
    )
    return () => {
      active = false
    }
  }, [syncClient])
  const allianceOfId = (id) => allianceOf(contacts.find((c) => c.id === id))
  const allianceApi = {
    save: (id, input, ownerName) => editContact(id, { alliance: applyAllianceSave(allianceOfId(id), input, ownerName) }),
    addNote: (id, text) =>
      editContact(id, { alliance: addAllianceNote(allianceOfId(id), text, { byId: sync?.userId || null, by: myProfile.data?.profile?.full_name || 'Dirección' }) }),
    removeNote: (id, noteId) => editContact(id, { alliance: removeAllianceNote(allianceOfId(id), noteId) }),
  }
  const todayInMyZone = keyOf(now, myZone)
  // Mis datos para «Cómo va cada área» (Mi equipo).
  const areaLocal = useMemo(() => ({ courses, students, attendance, vacancies, contacts }), [courses, students, attendance, vacancies, contacts])
  // Mensajes sin leer (menú e Inicio).
  const chatUnread = useChatUnread(syncClient)

  // Pase de lista y clases sueltas (attendance.js): cada cambio se guarda al momento. Los que no
  // son válidos lanzan un Error con el mensaje para el usuario.
  const attendanceActions = {
    mark: (cls, studentId, status) => {
      markAttendance(cls, studentId, status)
      reloadAttendance()
    },
    unmark: (cls, studentId) => {
      unmarkAttendance(cls, studentId)
      reloadAttendance()
    },
    setTimes: (cls, studentId, times) => {
      setAttendanceTimes(cls, studentId, times)
      reloadAttendance()
    },
    setLateMinutes: (cls, studentId, minutes) => {
      setLateMinutes(cls, studentId, minutes)
      reloadAttendance()
    },
    setJustification: (cls, studentId, justification) => {
      setJustification(cls, studentId, justification)
      reloadAttendance()
    },
    markAllPresent: (cls) => {
      markAllPresent(cls, students)
      reloadAttendance()
    },
    saveExtraClass: (courseId, values, timeZone, id) => {
      saveExtraClass(courseId, values, timeZone, id)
      reloadExtraClasses()
      reloadAttendance()
    },
    deleteExtraClass: (id) => {
      deleteExtraClass(id)
      reloadExtraClasses()
      reloadAttendance()
    },
  }

  // ---------------------------------------------------------------------------
  // Vacantes y candidatos
  // ---------------------------------------------------------------------------

  // Al crear (o confirmar) una entrevista, los candidatos en "nuevo" pasan a "entrevista".
  const applyInterviewUpdates = (meeting) => {
    for (const { id, patch } of interviewUpdates(meeting, contacts)) editContact(id, patch)
  }

  // Equipo y Vacantes ya no existen: quien intente abrirlas va a Inicio (los datos se quedan).
  const goToSection = (id) => {
    if (id === 'messages') setMessagesWith(null)
    setSection(REMOVED_SECTIONS.has(id) ? 'home' : id)
  }

  // «Nueva reunión»: reunión compartida si hay alguien con cuenta; si no, evento mío.
  // prefill: { date, time, start, end, externalIds, guests, interview, notAttending }.
  const openNewMeeting = (prefill = {}) => setFormModal({ prefill })
  const handleNewMeeting = () => openNewMeeting()

  // Archivo de contactos (Contactos › Archivados).
  const handleArchiveContact = (id) => editContact(id, archivePatch())
  const handleUnarchiveContact = (id) => editContact(id, unarchivePatch())

  // «Nueva reunión con esta persona»: el formulario con el contacto ya añadido (como externo y, si
  // tiene cuenta, también como participante).
  const handleNewMeetingWithContact = (contact) => openNewMeeting({ externalIds: [contact.id] })

  const handleOpenContact = (contactId) => {
    const contact = contacts.find((c) => c.id === contactId)
    // Los candidatos y las personas del equipo no están en Contactos (ni ya en Equipo ni Vacantes).
    if (!contact || isCandidateOnly(contact) || isActiveMember(contact)) return
    setSelectedEvent(null)
    setSelectedContactId(contactId)
    setSection('contacts')
  }

  // Convierte un invitado suelto en contacto y lo enlaza por id en la reunión.
  const handleSaveGuestAsContact = (event, guest, zone) => {
    const contact = addContact({ ...contactDataFromText(guest), ...zone })
    const current = participantsOf(event, contacts)
    const fields = participantFields(
      [...current.contacts, contact],
      current.guests.filter((g) => g !== guest),
    )
    // Si ese día de la serie tiene sus propios participantes, el cambio es solo de ese día.
    const series = seriesOf(event)
    const ownParticipants = series?.recurrence && 'guests' in (exceptionOf(series, occurrenceKeyOf(event)) || {})
    if (ownParticipants) editEvent(series.id, editOccurrencePatch(series, event, fields))
    else editEvent(event.seriesId, fields)
    setSelectedEvent((ev) => (ev ? { ...ev, ...fields } : ev))
  }

  // Hueco del calendario (día y hora en la zona de mi perfil): «Nueva reunión» a esa hora.
  const handleSlotClick = (day, hour) => {
    const start = new Date(day)
    start.setHours(hour, 0, 0, 0)
    // 1 hora, sin pasar de las 23:59 (a las 23:00: de 23:00 a 23:59).
    const dayEnd = new Date(day)
    dayEnd.setHours(0, DAY_END_MINUTES, 0, 0)
    const end = new Date(Math.min(start.getTime() + 60 * 60 * 1000, dayEnd.getTime()))
    openNewMeeting({ date: format(start, 'yyyy-MM-dd'), time: format(start, 'HH:mm'), start: fromWall(start, myZone), end: fromWall(end, myZone) })
  }

  const handleEditEvent = async (event) => {
    let scope = null
    if (event.isRecurringInstance) {
      scope = await askScope('edit', event)
      if (!scope) return
    }
    setSelectedEvent(null)
    setFormModal({ editingEvent: event, scope })
  }

  const handleDuplicateEvent = (event) => {
    setSelectedEvent(null)
    setFormModal({ prefill: { source: event } })
  }

  // Devuelve true si se ha borrado (false si se cancela).
  const handleDeleteEvent = async (event) => {
    if (!event.isRecurringInstance) {
      if (!window.confirm('¿Seguro que quieres eliminar este evento?')) return false
      removeEvent(event.seriesId)
      return true
    }
    const scope = await askScope('delete', event)
    if (!scope) return false
    const series = seriesOf(event)
    if (!series) return true
    const truncated = scope === SCOPES.FOLLOWING ? truncateSeriesPatch(series, event) : null
    if (scope === SCOPES.THIS) editEvent(series.id, cancelOccurrencePatch(series, event))
    else if (truncated) editEvent(series.id, truncated)
    else removeEvent(series.id)
    return true
  }

  // Arrastrar o redimensionar en Semana, Día o Mes. En una serie, pregunta a qué días se aplica.
  const handleMoveOrResize = async (event, newStart, newEnd) => {
    if (event.shared) return
    let scope = null
    if (event.isRecurringInstance) {
      scope = await askScope('move', event)
      if (!scope) return
    }
    const exclude = excludeFor(event, scope)
    // Las que organizo sin asistir no ocupan mi tiempo: no chocan con nada.
    const conflict = event.notAttending ? null : checkConflict(newStart, newEnd, exclude)
    if (conflict) {
      window.alert('Esta franja ya está ocupada.')
      return
    }
    const moved = { ...event, start: newStart, end: newEnd }
    const violations = warningsFor(moved)
    if (violations.length > 0) {
      const choice = await new Promise((resolve) => setMoveWarning({ violations, resolve }))
      if (choice === 'find') findSlotToReschedule(event)
      if (choice !== 'save') return
    }
    applyOccurrenceChange(event, { start: newStart, end: newEnd, acceptedUnavailable: acceptedUnavailableFor(moved) }, scope)
  }

  // Arrastrar o estirar en las vistas: de la hora de la zona de mi perfil a la de verdad.
  const handleZonedMove = (event, newStart, newEnd) => handleMoveOrResize(realEvent(event), fromWall(newStart, myZone), fromWall(newEnd, myZone))

  const handleFindSlotPick = (slot, participants, { notAttending = false, interview = false } = {}) => {
    const reschedule = findSlot?.reschedule
    setFindSlot(null)
    if (reschedule) {
      handleMoveOrResize(reschedule, slot.start, slot.end)
      return
    }
    const prefill = { start: slot.start, end: slot.end }
    if (participants && (participants.participantIds.length || participants.guests.length)) {
      prefill.externalIds = participants.participantIds
      prefill.guests = participants.guests
    }
    if (interview) prefill.interview = true
    if (notAttending) prefill.notAttending = true
    setFormModal({ prefill })
  }

  const handleFormSubmit = async (values, { ignoreWarnings = false } = {}) => {
    const { start, end } = values
    const editing = formModal?.editingEvent
    const exclude = editing ? excludeFor(editing, formModal.scope) : {}
    const conflict = values.notAttending ? null : checkConflict(start, end, exclude)
    if (conflict) {
      throw new Error('Esta franja ya está ocupada.')
    }
    if (!ignoreWarnings) {
      const violations = warningsFor(values)
      if (violations.length > 0) throw new MeetingWarningError(violations)
    }

    const accepted = { acceptedUnavailable: acceptedUnavailableFor(values) }
    const data = { ...values, ...accepted, start: start.toISOString(), end: end.toISOString() }
    if (editing) {
      applyOccurrenceChange(editing, { ...values, ...accepted }, formModal.scope)
    } else {
      const created = addEvent(data)
      // "Yo no asisto": se abre la reunión con el mensaje de convocatoria listo para enviar.
      const occurrence = created.notAttending ? expandEvent(created, start, end)[0] : null
      if (occurrence) {
        setSelectedEvent(occurrence)
        setNotesFocus(false)
        setConvocationFor(occurrence.id)
      }
    }
    applyInterviewUpdates(data)
  }

  const handlePrev = () => setCurrentDate((d) => stepDate(d, view, compactWeek, -1))
  const handleNext = () => setCurrentDate((d) => stepDate(d, view, compactWeek, 1))

  const handleToday = () => setCurrentDate(toWall(new Date(), myZone))

  return (
    <SchedulingContext.Provider value={scheduling}>
      <div className="app">
        <Sidebar
          summary={summary}
          now={now}
          section={section}
          onSectionChange={goToSection}
          onOpenBackup={() => setBackupOpen(true)}
          proposals={proposalItems}
          onOpenProposal={setProposalModalId}
          missingNotes={missingNotes}
          unavailableMeetings={unavailableMeetings}
          onOpenUnavailable={(item) => openEvent(item.occurrence)}
          onRescheduleUnavailable={(item) => findSlotToReschedule(item.occurrence)}
          onKeepUnavailable={handleKeepUnavailable}
          onOpenMissingNotes={(ev) => openEvent(ev, { focusNotes: true })}
          showAccess={!!sync}
          badges={{ messages: chatUnread }}
        />

        {section === 'contacts' && (
          <div className="app-main">
            <Suspense fallback={<SectionLoading />}>
              <ContactsView
                title="Mis contactos"
                contacts={contacts}
                groups={groups}
                rawEvents={rawEvents}
                now={now}
                selectedContactId={selectedContactId}
                onSelectContact={setSelectedContactId}
                onAddContact={addContact}
                onEditContact={editContact}
                onRemoveContact={removeContact}
                onOpenEvent={openEvent}
                onNewMeetingWithContact={handleNewMeetingWithContact}
                onCreateGroup={handleCreateGroup}
                onRenameGroup={(id, name) => handleUpdateGroup(id, { name })}
                onGroupColor={(id, color) => handleUpdateGroup(id, { color })}
                onDeleteGroup={handleDeleteGroup}
                onArchiveContact={handleArchiveContact}
                onUnarchiveContact={handleUnarchiveContact}
                renderAlliance={(c) => (
                  <>
                    <AllianceShare contact={c} onChange={(shared) => editContact(c.id, { allianceShared: shared })} />
                    <AlliancePanel contact={c} canEdit people={alliancePeople} api={allianceApi} today={todayInMyZone} />
                  </>
                )}
              />
            </Suspense>
          </div>
        )}

        {section === 'alliances' && (
          <div className="app-main">
            <Suspense fallback={<SectionLoading />}>
              <AlliancesView contacts={contacts} canEdit people={alliancePeople} api={allianceApi} today={todayInMyZone} />
            </Suspense>
          </div>
        )}

        {section === 'profile' && sync && (
          <div className="app-main">
            <Suspense fallback={<SectionLoading />}>
              <MyProfileView state={myProfile} onDone={() => goToSection('home')} />
            </Suspense>
          </div>
        )}

        {section === 'team-tasks' && sync && (
          <div className="app-main">
            <Suspense fallback={<SectionLoading />}>
              <TeamTasksView client={sync.client} me={CEO_ME(sync.userId)} zone={myZone} />
            </Suspense>
          </div>
        )}

        {section === 'messages' && sync && (
          <div className="app-main">
            <Suspense fallback={<SectionLoading />}>
              <MessagesView key={messagesWith || ''} client={sync.client} meId={sync.userId} zone={myZone} withPerson={messagesWith} />
            </Suspense>
          </div>
        )}

        {section === 'org' && sync && (
          <div className="app-main">
            <Suspense fallback={<SectionLoading />}>
              <OrgChartView
                client={sync.client}
                meId={sync.userId}
                onMessage={(id) => {
                  setMessagesWith(id)
                  setSection('messages')
                }}
              />
            </Suspense>
          </div>
        )}

        {section === 'mailbox' && sync && (
          <div className="app-main">
            <Suspense fallback={<SectionLoading />}>
              <MailboxView client={sync.client} isCeo />
            </Suspense>
          </div>
        )}

        {section === 'newsletter' && sync && (
          <div className="app-main">
            <Suspense fallback={<SectionLoading />}>
              <NewsletterView client={sync.client} canPublish />
            </Suspense>
          </div>
        )}

        {section === 'testimonials' && sync && (
          <div className="app-main">
            <Suspense fallback={<SectionLoading />}>
              <TestimonialsView client={sync.client} />
            </Suspense>
          </div>
        )}

        {section === 'team-edits' && sync && (
          <div className="app-main">
            <Suspense fallback={<SectionLoading />}>
              <TeamEditsView client={sync.client} />
            </Suspense>
          </div>
        )}

        {section === 'finance' && sync && (
          <div className="app-main">
            <Suspense fallback={<SectionLoading />}>
              <FinanceView client={sync.client} me={CEO_ME(sync.userId)} zone={myZone} />
            </Suspense>
          </div>
        )}

        {section === 'notices' && sync && (
          <div className="app-main">
            <Suspense fallback={<SectionLoading />}>
              <NoticesView client={sync.client} me={CEO_ME(sync.userId)} />
            </Suspense>
          </div>
        )}

        {section === 'boards' && sync && (
          <div className="app-main">
            <Suspense fallback={<SectionLoading />}>
              <BoardsView client={sync.client} me={CEO_ME(sync.userId)} zone={myZone} />
            </Suspense>
          </div>
        )}

        {section === 'goals' && sync && (
          <div className="app-main">
            <Suspense fallback={<SectionLoading />}>
              <GoalsView client={sync.client} me={CEO_ME(sync.userId)} zone={myZone} />
            </Suspense>
          </div>
        )}

        {section === 'access' && sync && (
          <div className="app-main">
            <Suspense fallback={<SectionLoading />}>
              <AccessView contacts={contacts} students={students} onCreateStudent={handleAddStudent} onCreateTeamMember={addContact} />
            </Suspense>
          </div>
        )}

        {section === 'clockins' && (
          <div className="app-main">
            <Suspense fallback={<SectionLoading />}>
              {sync ? (
                <ClockView client={sync.client} me={CEO_ME(sync.userId)} zone={myZone} />
              ) : (
                <ComingSoonView title="Fichajes" Icon={Clock} note="Con la sincronización activa verás aquí los fichajes del equipo." />
              )}
            </Suspense>
          </div>
        )}

        {section === 'attendance' && (
          <div className="app-main">
            <Suspense fallback={<SectionLoading />}>
              <AttendanceView
                courses={courses}
                students={students}
                contacts={contacts}
                attendance={attendance}
                extraClasses={extraClasses}
                actions={attendanceActions}
              />
            </Suspense>
          </div>
        )}

        {(section === 'students' || section === 'courses') && (
          <div className="app-main">
            <Suspense fallback={<SectionLoading />}>
              <StudentsView
                tab={section}
                portals={portals}
                onCopyFromPortal={handleCopyFromPortal}
                students={students}
                courses={courses}
                contacts={contacts}
                attendance={attendance}
                extraClasses={extraClasses}
                attendanceActions={attendanceActions}
                now={now}
                selectedStudentId={selectedStudentId}
                onSelectStudent={setSelectedStudentId}
                onAddStudent={handleAddStudent}
                onEditStudent={handleEditStudent}
                onRemoveStudent={handleRemoveStudent}
                onCreateCourse={handleCreateCourse}
                onRenameCourse={handleRenameCourse}
                onUpdateCourse={handleUpdateCourse}
                onDeleteCourse={handleDeleteCourse}
                scheduler={scheduler}
                gradesClient={syncClient}
              />
            </Suspense>
          </div>
        )}

        {section === 'home' && (
          <div className="app-main">
            {sync && myProfileMissing && <ProfileReminder onOpen={() => goToSection('profile')} />}
            <Suspense fallback={null}>
              <CeoHome
                client={sync ? sync.client : null}
                zone={myZone}
                now={now}
                local={areaLocal}
                rawEvents={rawEvents}
                sharedRows={sharedMeetings.rows}
                proposalsCount={proposalItems.length}
                unreadMessages={chatUnread}
                onGoTo={goToSection}
              />
            </Suspense>
          </div>
        )}

        {section === 'report' && (
          <div className="app-main">
            <Suspense fallback={<SectionLoading />}>
              <ReportView
                rawEvents={rawEvents}
                workingHours={workingHours}
                contacts={contacts}
                groups={groups}
                now={now}
                onOpenEvent={openEvent}
                onBack={() => goToSection('home')}
              />
            </Suspense>
          </div>
        )}

        {section === 'calendar' && (
          <div className="app-main">
            <CalendarHeader
              label={headerLabel(currentDate, view, compactWeek)}
              view={view}
              onViewChange={setView}
              onPrev={handlePrev}
              onNext={handleNext}
              onToday={handleToday}
              onNewMeeting={handleNewMeeting}
            />

            <PreviewMeContext.Provider value={sync?.userId || null}>
              <div className="app-calendar-body">
                {view === 'month' && (
                  <MonthView
                    currentDate={currentDate}
                    events={zonedEvents}
                    onSelectEvent={(ev) => openEvent(realEvent(ev))}
                    onMoveEvent={handleZonedMove}
                    onSelectDay={(day) => {
                      setCurrentDate(day)
                      setView('day')
                    }}
                  />
                )}
                {view === 'week' && (
                  <WeekView
                    currentDate={currentDate}
                    compact={compactWeek}
                    events={zonedEvents}
                    workingHours={workingHours}
                    onSelectEvent={(ev) => openEvent(realEvent(ev))}
                    onSlotClick={handleSlotClick}
                    onMoveEvent={handleZonedMove}
                    onResizeEvent={handleZonedMove}
                  />
                )}
                {view === 'day' && (
                  <DayView
                    currentDate={currentDate}
                    events={zonedEvents}
                    workingHours={workingHours}
                    onSelectEvent={(ev) => openEvent(realEvent(ev))}
                    onSlotClick={handleSlotClick}
                    onMoveEvent={handleZonedMove}
                    onResizeEvent={handleZonedMove}
                  />
                )}
              </div>
            </PreviewMeContext.Provider>
          </div>
        )}

        <MobileNav
          section={section}
          onSectionChange={goToSection}
          showAccess={!!sync}
          badges={{ messages: chatUnread }}
          actions={[
            ...(viewAs ? [{ id: 'view-as', label: 'Ver como…', Icon: Eye, onClick: viewAs.open }] : []),
          ]}
        />

        {sync && sharedOpen && (
          <Suspense fallback={null}>
            <MeetingDetailModal
              client={sync.client}
              meeting={sharedOpen}
              meId={sync.userId}
              zone={myZone}
              onClose={() => setSharedOpen(null)}
              onChanged={() => {
                setSharedOpen(null)
                sharedMeetings.reload()
              }}
              onEdit={(meeting) => {
                setSharedOpen(null)
                setFormModal({ meeting })
              }}
            />
          </Suspense>
        )}
        <EventModal
          key={selectedEvent?.id || 'none'}
          event={selectedEvent}
          contacts={contacts}
          now={now}
          focusNotes={notesFocus}
          onSaveSession={handleSaveSession}
          openConvocation={!!selectedEvent && convocationFor === selectedEvent.id}
          onClose={() => {
            setSelectedEvent(null)
            setConvocationFor(null)
          }}
          onOpenContact={handleOpenContact}
          onSaveGuestAsContact={handleSaveGuestAsContact}
          onEdit={handleEditEvent}
          onDelete={handleDeleteEvent}
          onRestoreOccurrence={handleRestoreOccurrence}
          onDuplicate={handleDuplicateEvent}
          onConfirmOption={handleConfirmOption}
          onCancelProposal={handleCancelProposal}
          onTeamTask={sync ? setTeamTaskDraft : null}
          organizerName={myProfile.data?.profile?.full_name || ''}
        />

        {teamTaskDraft && sync && (
          <Suspense fallback={null}>
            <NewTeamTaskModal
              client={sync.client}
              me={CEO_ME(sync.userId)}
              zone={myZone}
              prefill={teamTaskDraft}
              onClose={() => setTeamTaskDraft(null)}
              onSaved={() => setTeamTaskDraft(null)}
            />
          </Suspense>
        )}

        {formModal && (
          <Suspense fallback={null}>
            <MeetingFormModal
              client={sync?.client || null}
              meId={sync?.userId || 'yo'}
              zone={myZone}
              isCeo
              meeting={formModal.meeting || null}
              event={formModal.editingEvent || null}
              scope={formModal.scope || null}
              prefill={formModal.prefill || null}
              contacts={contacts}
              groups={groups}
              students={students}
              onSaveLocal={handleFormSubmit}
              onClose={() => setFormModal(null)}
              onSaved={() => {
                setFormModal(null)
                sharedMeetings.reload()
              }}
            />
          </Suspense>
        )}

        {findSlot && (
          <FindSlotModal
            initialDurationMinutes={findSlot.durationMinutes || 60}
            initialParticipants={findSlot.participants}
            initialInterview={!!findSlot.interview}
            initialNotAttending={!!findSlot.notAttending}
            onPick={handleFindSlotPick}
            onCreateProposal={handleCreateProposal}
            onClose={() => setFindSlot(null)}
          />
        )}

        {proposalModalId && proposals.some((p) => p.id === proposalModalId) && (
          <Suspense fallback={null}>
            <ProposalModal
              proposal={proposals.find((p) => p.id === proposalModalId)}
              onConfirmOption={handleConfirmOption}
              onCancelProposal={handleCancelProposal}
              onClose={() => setProposalModalId(null)}
            />
          </Suspense>
        )}

        {backupOpen && (
          <Suspense fallback={null}>
            <BackupModal onClose={() => setBackupOpen(false)} onRestored={handleBackupRestored} />
          </Suspense>
        )}

        {moveWarning && (
          <MeetingWarningDialog
            violations={moveWarning.violations}
            onChoose={(choice) => {
              moveWarning.resolve(choice)
              setMoveWarning(null)
            }}
          />
        )}

        {scopeAsk && (
          <RecurrenceScopeDialog
            action={scopeAsk.action}
            title={scopeAsk.title}
            onChoose={(scope) => {
              scopeAsk.resolve(scope)
              setScopeAsk(null)
            }}
            onCancel={() => {
              scopeAsk.resolve(null)
              setScopeAsk(null)
            }}
          />
        )}

      </div>
    </SchedulingContext.Provider>
  )
}

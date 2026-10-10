import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { addDays, addMonths, addWeeks, format, subDays, subMonths, subWeeks } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarCheck } from 'lucide-react'
import Sidebar from './components/Sidebar.jsx'
import MobileNav from './components/MobileNav.jsx'
import HomeView from './components/HomeView.jsx'
import CalendarHeader from './components/CalendarHeader.jsx'
import MonthView from './components/CalendarView/MonthView.jsx'
import WeekView from './components/CalendarView/WeekView.jsx'
import DayView from './components/CalendarView/DayView.jsx'
import EventModal from './components/EventModal.jsx'
import EventFormModal from './components/EventFormModal.jsx'
import FindSlotModal from './components/FindSlotModal.jsx'
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
import { deleteFile } from './lib/files/files.js'
import { planCandidacy } from './lib/applications.js'
import { AREAS_KEY, getStoredTeamAreas, isActiveMember, removeFromTeamPatch, saveTeamAreas } from './lib/team.js'
import { orderPatches } from './lib/teamOrder.js'
import { markFormerProfile, returnToTeamProfile, statusChangePatch } from './lib/formerMembers.js'
import { archivePatch, unarchivePatch } from './lib/archive.js'
import { addDepartment, moveDepartment, removeDepartment, renameDepartment, resolveDepartments } from './lib/departments.js'
import { useSync, useSyncStatus } from './lib/sync/syncContext.js'
import { runPendingMigrations } from './lib/dataMigrations.js'
import { STORAGE_KEY as GROUPS_KEY, contactsWithoutGroup, getAllGroups, groupsStore } from './lib/groups.js'
import {
  STORAGE_KEY as VACANCIES_KEY,
  candidacyPatch,
  candidatesOf,
  findCandidacy,
  getAllVacancies,
  incorporate,
  interviewUpdates,
  isCandidateOnly,
  latestCandidacy,
  newCandidacy,
  newVacancy,
  planErasure,
  removeCandidacyPlan,
  vacanciesStore,
  withStatus,
} from './lib/vacancies.js'
import {
  STORAGE_KEY as TASKS_KEY,
  getAllTasks,
  sourceOccurrence,
  taskData,
  taskSourcePatches,
  tasksStore,
} from './lib/tasks.js'
import { COMPACT_WEEK_DAYS, getVisibleRange } from './lib/dateHelpers.js'
import { useMediaQuery } from './lib/useMediaQuery.js'
import { computeSummary } from './lib/summary.js'
import { computeWeeklyReport, weekStartOf } from './lib/weeklyReport.js'
import { STORAGE_KEY as WEEKLY_AVAILABILITY_KEY, getAllWeeklyAvailability } from './lib/weeklyAvailability.js'
import { getPreferences, savePreferences } from './lib/preferences.js'
import { contactDataFromText, participantFields, participantsOf } from './lib/contacts.js'
import { useBookings } from './hooks/useBookings.js'
import { bookingContactData, bookingLinkUrl, decideRequest, matchContact, requestDescription, requestTitle } from './lib/bookings.js'
import './App.css'

// Las secciones y los modales que no hacen falta al abrir el calendario se cargan aparte,
// la primera vez que se usan (el service worker los guarda para usarlos sin conexión).
const ContactsView = lazy(() => import('./components/ContactsView.jsx'))
const VacanciesView = lazy(() => import('./components/VacanciesView.jsx'))
const TeamView = lazy(() => import('./components/TeamView.jsx'))
const ReportView = lazy(() => import('./components/ReportView.jsx'))
const TasksView = lazy(() => import('./components/TasksView.jsx'))
const TaskFormModal = lazy(() => import('./components/TaskFormModal.jsx'))
const ProposalModal = lazy(() => import('./components/ProposalModal.jsx'))
const BackupModal = lazy(() => import('./components/BackupModal.jsx'))
const MyScheduleModal = lazy(() => import('./components/MyScheduleModal.jsx'))
const DepartmentsModal = lazy(() => import('./components/DepartmentsModal.jsx'))
const BookingLinkModal = lazy(() => import('./components/BookingLinkModal.jsx'))
const BookingDecisionModal = lazy(() => import('./components/BookingDecisionModal.jsx'))

// Mientras llega el código de una sección: un aviso discreto que solo se ve si tarda.
function SectionLoading() {
  return (
    <div className="app-section-loading" role="status">
      Cargando…
    </div>
  )
}

// Rango compacto, p. ej. "23–25 sept 2026", "30 sept – 2 oct 2026" o "30 dic 2026 – 1 ene 2027".
function formatCompactRange(start, end) {
  if (start.getFullYear() !== end.getFullYear()) {
    return `${format(start, 'd MMM yyyy', { locale: es })} – ${format(end, 'd MMM yyyy', { locale: es })}`
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${format(start, 'd MMM', { locale: es })} – ${format(end, 'd MMM yyyy', { locale: es })}`
  }
  return `${format(start, 'd')}–${format(end, 'd MMM yyyy', { locale: es })}`
}

function getHeaderLabel(currentDate, view, compactWeek) {
  if (view === 'week' && compactWeek) return formatCompactRange(currentDate, addDays(currentDate, COMPACT_WEEK_DAYS - 1))
  if (view === 'day') return format(currentDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })
  if (view === 'week') return format(currentDate, "'Semana del' d 'de' MMMM yyyy", { locale: es })
  return format(currentDate, 'MMMM yyyy', { locale: es })
}

export default function App() {
  // Se abre en Inicio.
  const [section, setSection] = useState('home')
  const [selectedContactId, setSelectedContactId] = useState(null)
  const [selectedMemberId, setSelectedMemberId] = useState(null)
  const [selectedVacancyId, setSelectedVacancyId] = useState(null)
  const [selectedCandidacyId, setSelectedCandidacyId] = useState(null)
  const [view, setView] = useState('month')
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [selectedEvent, setSelectedEvent] = useState(null)
  // true si la reunión se abrió para escribir las notas (desde "Sin notas").
  const [notesFocus, setNotesFocus] = useState(false)
  // Reunión (id de la ocurrencia) que se abre con el mensaje de convocatoria ("Yo no asisto").
  const [convocationFor, setConvocationFor] = useState(null)
  const [formModal, setFormModal] = useState(null)
  // null = cerrado; { participants, interview, ... } = abierto, con los participantes iniciales
  // si los hay (interview: true desde "Buscar hueco para entrevista").
  const [findSlot, setFindSlot] = useState(null)
  const [backupOpen, setBackupOpen] = useState(false)
  // Enlace de reservas: modal del enlace y solicitud que se está aceptando o rechazando ({ request, decision }).
  const [bookingLinkOpen, setBookingLinkOpen] = useState(false)
  const [bookingDecision, setBookingDecision] = useState(null)
  const [proposalModalId, setProposalModalId] = useState(null)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [departmentsOpen, setDepartmentsOpen] = useState(false)
  // Pregunta "¿Solo este día, este y los siguientes o toda la serie?": { action, title, resolve }.
  const [scopeAsk, setScopeAsk] = useState(null)
  // Tarea abierta: null = cerrada; { task } para editarla o { initial } para crear una nueva.
  const [taskModal, setTaskModal] = useState(null)
  // Aviso al mover o redimensionar: { violations, resolve } (resolve: 'save' | 'find' | null).
  const [moveWarning, setMoveWarning] = useState(null)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(id)
  }, [])

  // En móvil la vista Semana muestra solo COMPACT_WEEK_DAYS días a partir de currentDate.
  const compactWeek = useMediaQuery('(max-width: 640px)')

  const range = useMemo(
    () => getVisibleRange(currentDate, view, { compactWeek }),
    [currentDate, view, compactWeek],
  )

  const {
    rawEvents,
    events,
    workingHours,
    setWorkingHours,
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
  const [weeklyAvailability, reloadWeeklyAvailability] = useStoredValue(WEEKLY_AVAILABILITY_KEY, getAllWeeklyAvailability)
  const [vacancies, reloadVacancies] = useStoredValue(VACANCIES_KEY, getAllVacancies)
  const [tasks, reloadTasks] = useStoredValue(TASKS_KEY, getAllTasks)

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
  }

  // Departamentos (antes "áreas"): la lista guardada, la nueva lista si aún era la de ejemplo, y
  // los que usan miembros o vacantes aunque no estén en la lista.
  const teamAreas = useMemo(() => resolveDepartments(storedAreas, contacts, vacancies).list, [storedAreas, contacts, vacancies])
  // Esa lista se guarda (y se sincroniza) solo cuando ya se ha descargado la nube, para no pisar
  // con la lista de ejemplo de este dispositivo una lista ya cambiada en otro.
  const sync = useSync()
  const syncStatus = useSyncStatus()
  const canSaveDepartments = !sync || syncStatus.status === 'synced'
  // Enlace de reservas: con sesión iniciada (ya pasada la primera sincronización).
  const bookingsActive = !!sync && ['syncing', 'synced', 'offline', 'error'].includes(syncStatus.status)
  const bookings = useBookings({ active: bookingsActive, rawEvents, workingHours, now })
  // Las solicitudes pendientes ocupan su hueco también en "Buscar hueco".
  const bookingRequests = useMemo(() => bookings.requests.map((r) => ({ start: r.starts_at, end: r.ends_at })), [bookings.requests])

  // Aceptar (se crea la reunión con su enlace, vinculada al contacto si coincide o al nuevo si se guarda) o
  // rechazar una solicitud. Devuelve un aviso si la hora ya se solapa con algo del calendario.
  const handleBookingDecision = async ({ saveContact, meetLink = '' }) => {
    const { request, decision } = bookingDecision
    await decideRequest(request.id, decision)
    bookings.setRequests((list) => list.filter((r) => r.id !== request.id))
    if (decision !== 'accepted') return null
    const start = new Date(request.starts_at)
    const end = new Date(request.ends_at)
    let contact = matchContact(request, contacts)
    if (!contact && saveContact) contact = addContact(bookingContactData(request))
    const conflict = checkConflict(start, end)
    addEvent({
      title: requestTitle(request),
      description: requestDescription(request),
      ...participantFields(contact ? [contact] : [], contact ? [] : [request.name]),
      isUnavailable: false,
      allDay: false,
      start: start.toISOString(),
      end: end.toISOString(),
      recurrence: null,
      // Según dónde quiso hacerla: mi sala fija, uno nuevo de Jitsi o ninguno (ver videoCall.js).
      meetLink,
      bookingRequestId: request.id,
    })
    return conflict ? 'Ojo: a esa hora ya tienes otra cosa en el calendario (se ha creado igualmente).' : null
  }

  useEffect(() => {
    if (!canSaveDepartments) return
    // Migraciones únicas de datos (departamentos; antiguos miembros al archivo).
    if (runPendingMigrations().length > 0) {
      reloadAllData()
      return
    }
    const { list, changed } = resolveDepartments(getStoredTeamAreas(), contacts, vacancies)
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
      bookingRequests,
      contacts,
      addContact,
      proposals,
      groups,
    }),
    [rawEvents, workingHours, bookingRequests, contacts, addContact, proposals, groups],
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

  // ---------------------------------------------------------------------------
  // Tareas
  // ---------------------------------------------------------------------------

  const today = dateKey(now)

  // `initial`: datos de la tarea nueva ({ title, source, decisionId } si sale del acta).
  const handleNewTask = (initial = {}) => setTaskModal({ initial })
  const handleOpenTask = (task) => setTaskModal({ task })

  const handleSaveTask = (data) => {
    const editing = taskModal?.task
    if (editing) tasksStore.update(editing.id, taskData(data, editing))
    else tasksStore.create(taskData(data))
    reloadTasks()
  }

  const handleDeleteTask = (id) => {
    tasksStore.remove(id)
    reloadTasks()
  }

  const handleToggleTask = (task) => {
    tasksStore.update(task.id, taskData({ ...task, status: task.status === 'done' ? 'pending' : 'done' }, task))
    reloadTasks()
  }

  // Abre la reunión (o la sesión) de la que sale la tarea.
  const handleOpenTaskSource = (task) => {
    const occurrence = sourceOccurrence(task, rawEvents)
    if (!occurrence) return
    setTaskModal(null)
    setSection('calendar')
    setCurrentDate(new Date(occurrence.start))
    openEvent(occurrence)
  }

  // «Tu semana» en Inicio: esta semana comparada con la anterior (lo mismo que el informe).
  const weekReport = useMemo(
    () => computeWeeklyReport(rawEvents, { weekStart: weekStartOf(now), workingHours }),
    [rawEvents, workingHours, now],
  )

  const summary = useMemo(
    () => computeSummary(rawEvents, workingHours, now),
    [rawEvents, workingHours, now],
  )

  // "Mi horario": se guarda como horario fijo y deja de partir de la última semana declarada.
  const handleSaveSchedule = (week) => {
    setWorkingHours(week)
    savePreferences({ ...getPreferences(), fixedScheduleSaved: true })
  }

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
  // Vacantes y candidatos
  // ---------------------------------------------------------------------------

  // Al crear (o confirmar) una entrevista, los candidatos en "nuevo" pasan a "entrevista".
  const applyInterviewUpdates = (meeting) => {
    for (const { id, patch } of interviewUpdates(meeting, contacts)) editContact(id, patch)
  }

  const handleCreateVacancy = (data) => {
    const vacancy = vacanciesStore.create(newVacancy(data))
    reloadVacancies()
    return vacancy
  }

  const handleUpdateVacancy = (id, patch) => {
    vacanciesStore.update(id, patch)
    reloadVacancies()
  }

  // Quitar una candidatura: se borran su CV y sus notas, y el contacto solo si existía únicamente por ella.
  const handleRemoveCandidacy = (contact, candidacyId) => {
    const plan = removeCandidacyPlan(contact, candidacyId)
    if (plan.deleteContact) {
      removeContact(contact.id)
      return
    }
    editContact(contact.id, plan.patch)
    for (const ref of plan.files) deleteFile(ref)
  }

  // Al borrar una vacante se borran también sus candidaturas.
  const handleDeleteVacancy = (id) => {
    for (const { contact, candidacy } of candidatesOf(id, contacts)) handleRemoveCandidacy(contact, candidacy.id)
    vacanciesStore.remove(id)
    reloadVacancies()
  }

  // Nueva candidatura: al contacto elegido, al que ya tiene ese email o a un contacto nuevo.
  const handleAddCandidacy = (vacancyId, { contactId, contactData, candidacy }) => {
    const entry = newCandidacy(vacancyId, candidacy)
    const plan = planCandidacy(contacts, contactData || {}, entry, contactId)
    if (plan.action === 'create') addContact(plan.contact)
    else editContact(plan.id, plan.patch)
  }

  const handleEditCandidacy = (contact, candidacyId, { contactData, candidacy }) =>
    editContact(contact.id, { ...(contactData || {}), ...candidacyPatch(contact, candidacyId, candidacy) })

  const handleCandidateStatus = (contact, candidacyId, status) =>
    editContact(contact.id, candidacyPatch(contact, candidacyId, (c) => withStatus(c, status)))

  const handleFindInterviewSlot = (contact) =>
    setFindSlot({ participants: { participantIds: [contact.id], guests: [] }, interview: true })

  // Candidato → miembro del equipo: perfil con el nuevo rol en su trayectoria (si ya era del equipo,
  // se ha preguntado si se suma o sustituye), vacante cubierta y, si quedan otros candidatos, se
  // ofrece descartarlos.
  const handleIncorporate = (contact, candidacyId, vacancy, { contactPatch, teamProfile }) => {
    const result = incorporate({ contact, candidacyId, vacancy, teamProfile, contacts })
    editContact(contact.id, withStatusChange(contact, { ...contactPatch, ...result.contactPatch }))
    vacanciesStore.update(vacancy.id, result.vacancyPatch)
    reloadVacancies()
    const n = result.remaining.length
    if (n > 0) {
      const who = result.remaining.map((e) => `• ${e.contact.name}`).join('\n')
      const question = n === 1 ? 'Queda 1 candidato en esta vacante' : `Quedan ${n} candidatos en esta vacante`
      if (window.confirm(`${question}:\n${who}\n\n¿Marcarlos como descartados?`)) {
        for (const e of result.remaining) handleCandidateStatus(e.contact, e.candidacy.id, 'discarded')
      }
    }
  }

  // Protección de datos: borra los datos personales de las candidaturas descartadas hace más de
  // 6 meses y deja un registro anónimo en su vacante. Siempre tras la confirmación del usuario.
  const handleEraseExpired = (entries) => {
    const plan = planErasure(entries, getAllEvents(), vacancies, new Date(), proposals)
    for (const { id, patch } of plan.eventPatches) editEvent(id, patch)
    for (const { id, patch } of plan.proposalPatches) proposalsStore.update(id, patch)
    for (const [id, erasedCandidates] of Object.entries(plan.vacancyPatches)) vacanciesStore.update(id, { erasedCandidates })
    for (const { id, patch } of plan.contactPatches) editContact(id, patch)
    for (const ref of plan.files) deleteFile(ref)
    for (const id of plan.contactIds) removeContact(id)
    reloadProposals()
    reloadVacancies()
  }

  // Abre la candidatura más reciente de ese contacto.
  const handleOpenCandidate = (contactId) => {
    const candidacy = latestCandidacy(contacts.find((c) => c.id === contactId))
    setSelectedEvent(null)
    setSelectedVacancyId(candidacy?.vacancyId || null)
    setSelectedCandidacyId(candidacy?.id || null)
    setSelectedMemberId(null)
    setSection('team')
  }

  // Las vacantes están en Equipo, en su departamento.
  const handleOpenVacancy = (vacancyId) => {
    setSelectedVacancyId(vacancyId)
    setSelectedCandidacyId(null)
    setSelectedMemberId(null)
    setSection('team')
  }

  // Ir a una sección; Equipo se abre en la lista (sin persona, vacante ni candidato abiertos).
  const goToSection = (id) => {
    if (id === 'team') {
      setSelectedMemberId(null)
      setSelectedVacancyId(null)
      setSelectedCandidacyId(null)
    }
    setSection(id)
  }

  const handleNewMeeting = () => setFormModal({ mode: 'meeting', editingEvent: null, prefill: null })

  const handleAddArea = (name) => {
    saveTeamAreas(addDepartment(teamAreas, name))
    reloadTeamAreas()
  }

  // Renombrar o borrar un departamento cambia también a sus miembros y vacantes.
  const applyDepartmentChange = (result) => {
    if (result.error) return result.error
    for (const { id, patch } of result.contactPatches) editContact(id, patch)
    for (const { id, patch } of result.vacancyPatches) vacanciesStore.update(id, patch)
    saveTeamAreas(result.list)
    reloadTeamAreas()
    reloadVacancies()
    return null
  }

  const handleRenameDepartment = (oldName, newName) =>
    applyDepartmentChange(renameDepartment(teamAreas, oldName, newName, contacts, vacancies))

  const handleRemoveDepartment = (name, target) =>
    applyDepartmentChange(removeDepartment(teamAreas, name, target, contacts, vacancies))

  const handleMoveDepartment = (index, delta) => {
    saveTeamAreas(moveDepartment(teamAreas, index, delta))
    reloadTeamAreas()
  }

  // Pasar a antiguo miembro lo archiva y volver al equipo (o entrar en él) lo desarchiva.
  // Devuelve el cambio del contacto completo (ver formerMembers.js y archive.js).
  const withStatusChange = (contact, patch) => {
    const out = { ...patch, ...statusChangePatch({ before: contact.teamProfile, after: patch.teamProfile }) }
    if (contact.archived && out.teamProfile && out.teamProfile.status !== 'former') Object.assign(out, unarchivePatch())
    return out
  }

  // Archivo de contactos (Contactos › Archivados). Un miembro activo pasa antes a antiguo miembro.
  const handleArchiveContact = (id) => editContact(id, archivePatch())
  const handleUnarchiveContact = (id) => editContact(id, unarchivePatch())

  // Antiguo miembro → miembro del equipo, con su trayectoria anterior; se abre su ficha en Equipo.
  const handleReturnToTeam = (contact) => {
    editContact(contact.id, { teamProfile: returnToTeamProfile(contact.teamProfile), ...unarchivePatch() })
    handleOpenTeamMember(contact.id)
  }

  // Perfil de equipo: los datos de contacto (foto, email, teléfono) se guardan en el propio contacto.
  const handleSaveTeamProfile = (contactId, { contactPatch, teamProfile }) => {
    const contact = contacts.find((c) => c.id === contactId)
    editContact(contactId, contact ? withStatusChange(contact, { ...contactPatch, teamProfile }) : { ...contactPatch, teamProfile })
  }

  // Pasa a antiguo miembro con esa fecha de salida (y se archiva): desde el aviso de Equipo
  // (activos con todos sus roles terminados) o con «Archivar» en su ficha.
  const handleMarkFormer = (contact, leftAt) =>
    editContact(contact.id, withStatusChange(contact, { teamProfile: markFormerProfile(contact.teamProfile, leftAt) }))

  const handleKeepActive = (contact) => editContact(contact.id, { teamProfile: { ...contact.teamProfile, keepActive: true } })

  // Orden de las personas de un departamento (ver teamOrder.js): solo cambian las que se mueven.
  // En Equipo, con una vacante o un candidato abiertos se ve su detalle (VacanciesView).
  const vacancyOpen =
    (!!selectedCandidacyId && !!findCandidacy(contacts, selectedCandidacyId)) ||
    (!!selectedVacancyId && vacancies.some((v) => v.id === selectedVacancyId))

  const handleReorderDepartment = (area, ordered) => {
    for (const { id, patch } of orderPatches(ordered, area)) editContact(id, patch)
  }

  const handleOpenTeamMember = (contactId) => {
    setSelectedEvent(null)
    setSelectedVacancyId(null)
    setSelectedCandidacyId(null)
    setSelectedMemberId(contactId)
    setSection('team')
  }

  const handleFindSlotWithContact = (contact) => setFindSlot({ participants: { participantIds: [contact.id], guests: [] } })

  const handleNewMeetingWithContact = (contact) =>
    setFormModal({ mode: 'meeting', editingEvent: null, prefill: { participantIds: [contact.id], guests: [] } })

  const handleOpenContact = (contactId) => {
    const contact = contacts.find((c) => c.id === contactId)
    if (isCandidateOnly(contact)) {
      handleOpenCandidate(contactId)
      return
    }
    // Los miembros activos del equipo no están en Contactos: su ficha es la de Equipo.
    if (isActiveMember(contact)) {
      handleOpenTeamMember(contactId)
      return
    }
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

  const handleSlotClick = (day, hour) => {
    const start = new Date(day)
    start.setHours(hour, 0, 0, 0)
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    setFormModal({ mode: 'meeting', editingEvent: null, prefill: { start, end } })
  }

  const handleEditEvent = async (event) => {
    let scope = null
    if (event.isRecurringInstance) {
      scope = await askScope('edit', event)
      if (!scope) return
    }
    setSelectedEvent(null)
    setFormModal({ mode: event.isUnavailable ? 'unavailable' : 'meeting', editingEvent: event, prefill: null, scope })
  }

  const handleDuplicateEvent = (event) => {
    setSelectedEvent(null)
    setFormModal({ mode: event.isUnavailable ? 'unavailable' : 'meeting', editingEvent: null, prefill: event })
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

  const handleFindSlotPick = (slot, participants, { notAttending = false, interview = false } = {}) => {
    const reschedule = findSlot?.reschedule
    setFindSlot(null)
    if (reschedule) {
      handleMoveOrResize(reschedule, slot.start, slot.end)
      return
    }
    const prefill = { start: slot.start, end: slot.end }
    if (participants && (participants.participantIds.length || participants.guests.length)) {
      prefill.participantIds = participants.participantIds
      prefill.guests = participants.guests
    }
    if (interview) prefill.interview = true
    if (notAttending) prefill.notAttending = true
    setFormModal({ mode: 'meeting', editingEvent: null, prefill })
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

  const handlePrev = () => {
    if (view === 'month') setCurrentDate((d) => subMonths(d, 1))
    else if (view === 'week' && compactWeek) setCurrentDate((d) => subDays(d, COMPACT_WEEK_DAYS))
    else if (view === 'week') setCurrentDate((d) => subWeeks(d, 1))
    else setCurrentDate((d) => subDays(d, 1))
  }

  const handleNext = () => {
    if (view === 'month') setCurrentDate((d) => addMonths(d, 1))
    else if (view === 'week' && compactWeek) setCurrentDate((d) => addDays(d, COMPACT_WEEK_DAYS))
    else if (view === 'week') setCurrentDate((d) => addWeeks(d, 1))
    else setCurrentDate((d) => addDays(d, 1))
  }

  const handleToday = () => setCurrentDate(new Date())

  return (
    <SchedulingContext.Provider value={scheduling}>
      <div className="app">
        <Sidebar
          summary={summary}
          now={now}
          section={section}
          onSectionChange={goToSection}
          onOpenBackup={() => setBackupOpen(true)}
          onOpenBookingLink={sync ? () => setBookingLinkOpen(true) : null}
          proposals={proposalItems}
          onOpenProposal={setProposalModalId}
          missingNotes={missingNotes}
          unavailableMeetings={unavailableMeetings}
          onOpenUnavailable={(item) => openEvent(item.occurrence)}
          onRescheduleUnavailable={(item) => findSlotToReschedule(item.occurrence)}
          onKeepUnavailable={handleKeepUnavailable}
          onOpenMissingNotes={(ev) => openEvent(ev, { focusNotes: true })}
        />

        {section === 'contacts' && (
          <div className="app-main">
            <Suspense fallback={<SectionLoading />}>
              <ContactsView
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
                onFindSlotWithContact={handleFindSlotWithContact}
                onCreateGroup={handleCreateGroup}
                onRenameGroup={(id, name) => handleUpdateGroup(id, { name })}
                onGroupColor={(id, color) => handleUpdateGroup(id, { color })}
                onDeleteGroup={handleDeleteGroup}
                areas={teamAreas}
                onAddArea={handleAddArea}
                onSaveTeamProfile={handleSaveTeamProfile}
                onArchiveContact={handleArchiveContact}
                onUnarchiveContact={handleUnarchiveContact}
                onReturnToTeam={handleReturnToTeam}
                onOpenTeamMember={handleOpenTeamMember}
                onOpenCandidate={handleOpenCandidate}
              />
            </Suspense>
          </div>
        )}

        {section === 'team' && vacancyOpen && (
          <div className="app-main">
            <Suspense fallback={<SectionLoading />}>
              <VacanciesView
                vacancies={vacancies}
                contacts={contacts}
                rawEvents={rawEvents}
                now={now}
                areas={teamAreas}
                groups={groups}
                onAddArea={handleAddArea}
                selectedVacancyId={selectedVacancyId}
                onSelectVacancy={setSelectedVacancyId}
                selectedCandidacyId={selectedCandidacyId}
                onSelectCandidacy={setSelectedCandidacyId}
                onCreateVacancy={handleCreateVacancy}
                onUpdateVacancy={handleUpdateVacancy}
                onDeleteVacancy={handleDeleteVacancy}
                onAddCandidacy={handleAddCandidacy}
                onEditCandidacy={handleEditCandidacy}
                onRemoveCandidacy={handleRemoveCandidacy}
                onCandidateStatus={handleCandidateStatus}
                onFindInterviewSlot={handleFindInterviewSlot}
                onIncorporate={handleIncorporate}
                onOpenEvent={openEvent}
                onOpenTeamMember={handleOpenTeamMember}
              />
            </Suspense>
          </div>
        )}

        {section === 'team' && !vacancyOpen && (
          <div className="app-main">
            <Suspense fallback={<SectionLoading />}>
              <TeamView
                contacts={contacts}
                groups={groups}
                rawEvents={rawEvents}
                now={now}
                areas={teamAreas}
                selectedMemberId={selectedMemberId}
                onSelectMember={setSelectedMemberId}
                onSaveProfile={handleSaveTeamProfile}
                onMarkFormer={handleMarkFormer}
                onKeepActive={handleKeepActive}
                onRemoveFromTeam={(id) => editContact(id, removeFromTeamPatch(contacts.find((c) => c.id === id)))}
                onAddArea={handleAddArea}
                onManageDepartments={() => setDepartmentsOpen(true)}
                onOpenEvent={openEvent}
                onFindSlot={handleFindSlotWithContact}
                onNewMeeting={handleNewMeetingWithContact}
                onOpenCandidate={handleOpenCandidate}
                tasks={tasks}
                today={today}
                onToggleTask={handleToggleTask}
                onOpenTask={handleOpenTask}
                onOpenTaskSource={handleOpenTaskSource}
                onReorder={handleReorderDepartment}
                vacancies={vacancies}
                onOpenVacancy={handleOpenVacancy}
                onCreateVacancy={handleCreateVacancy}
                onEraseExpired={handleEraseExpired}
              />
            </Suspense>
          </div>
        )}

        {section === 'home' && (
          <div className="app-main">
            <HomeView
              now={now}
              today={today}
              week={weekReport}
              rawEvents={rawEvents}
              contacts={contacts}
              tasks={tasks}
              vacancies={vacancies}
              proposals={proposalItems}
              missingNotes={missingNotes}
              onGoTo={goToSection}
              onOpenEvent={openEvent}
              onOpenEventNotes={(ev) => openEvent(ev, { focusNotes: true })}
              onToggleTask={handleToggleTask}
              onOpenTask={handleOpenTask}
              onOpenVacancy={handleOpenVacancy}
              onOpenProposal={setProposalModalId}
              bookings={
                sync
                  ? {
                      requests: bookings.requests,
                      onOpenLink: () => setBookingLinkOpen(true),
                      contacts,
                      onUnarchive: handleUnarchiveContact,
                      onAccept: (request) => setBookingDecision({ request, decision: 'accepted' }),
                      onReject: (request) => setBookingDecision({ request, decision: 'rejected' }),
                    }
                  : null
              }
            />
          </div>
        )}

        {section === 'tasks' && (
          <div className="app-main">
            <Suspense fallback={<SectionLoading />}>
              <TasksView
                tasks={tasks}
                contacts={contacts}
                rawEvents={rawEvents}
                today={today}
                onNewTask={handleNewTask}
                onOpenTask={handleOpenTask}
                onToggleTask={handleToggleTask}
                onOpenSource={handleOpenTaskSource}
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
              label={getHeaderLabel(currentDate, view, compactWeek)}
              view={view}
              onViewChange={setView}
              onPrev={handlePrev}
              onNext={handleNext}
              onToday={handleToday}
              onNewMeeting={handleNewMeeting}
              onFindSlot={() => setFindSlot({})}
              onOpenSchedule={() => setScheduleOpen(true)}
            />

            <div className="app-calendar-body">
              {view === 'month' && (
                <MonthView
                  currentDate={currentDate}
                  events={events}
                  onSelectEvent={openEvent}
                  onMoveEvent={handleMoveOrResize}
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
                  events={events}
                  workingHours={workingHours}
                  onSelectEvent={openEvent}
                  onSlotClick={handleSlotClick}
                  onMoveEvent={handleMoveOrResize}
                  onResizeEvent={handleMoveOrResize}
                />
              )}
              {view === 'day' && (
                <DayView
                  currentDate={currentDate}
                  events={events}
                  workingHours={workingHours}
                  onSelectEvent={openEvent}
                  onSlotClick={handleSlotClick}
                  onMoveEvent={handleMoveOrResize}
                  onResizeEvent={handleMoveOrResize}
                />
              )}
            </div>
          </div>
        )}

        <MobileNav
          section={section}
          onSectionChange={goToSection}
          actions={sync ? [{ id: 'booking-link', label: 'Enlace de reservas', Icon: CalendarCheck, onClick: () => setBookingLinkOpen(true) }] : []}
        />

        <EventModal
          key={selectedEvent?.id || 'none'}
          event={selectedEvent}
          contacts={contacts}
          now={now}
          focusNotes={notesFocus}
          onSaveSession={handleSaveSession}
          tasks={tasks}
          onNewTask={handleNewTask}
          onOpenTask={handleOpenTask}
          onToggleTask={handleToggleTask}
          onOpenTaskSource={handleOpenTaskSource}
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
        />

        {taskModal && (
          <Suspense fallback={null}>
            <TaskFormModal
              key={taskModal.task?.id || 'new'}
              task={taskModal.task || null}
              initial={taskModal.initial}
              contacts={contacts}
              onSave={handleSaveTask}
              onDelete={handleDeleteTask}
              onClose={() => setTaskModal(null)}
            />
          </Suspense>
        )}

        {formModal && (
          <EventFormModal
            mode={formModal.mode}
            initialEvent={formModal.editingEvent}
            scope={formModal.scope}
            prefill={formModal.prefill}
            defaultDate={currentDate}
            contacts={contacts}
            onCreateContact={addContact}
            onClose={() => setFormModal(null)}
            onSubmit={handleFormSubmit}
          />
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

        {bookingLinkOpen && (
          <Suspense fallback={null}>
            <BookingLinkModal
              key={bookings.link === undefined ? 'cargando' : bookings.link?.token || 'sin-enlace'}
              syncActive={bookingsActive}
              link={bookingsActive ? bookings.link : null}
              onLinkChange={bookings.onLinkChange}
              rawEvents={rawEvents}
              workingHours={workingHours}
              onClose={() => setBookingLinkOpen(false)}
            />
          </Suspense>
        )}

        {bookingDecision && (
          <Suspense fallback={null}>
            <BookingDecisionModal
              request={bookingDecision.request}
              decision={bookingDecision.decision}
              contacts={contacts}
              onUnarchive={handleUnarchiveContact}
              linkUrl={bookings.link ? bookingLinkUrl(bookings.link.token) : ''}
              onDecide={handleBookingDecision}
              onClose={() => setBookingDecision(null)}
            />
          </Suspense>
        )}

        {backupOpen && (
          <Suspense fallback={null}>
            <BackupModal onClose={() => setBackupOpen(false)} onRestored={handleBackupRestored} />
          </Suspense>
        )}

        {scheduleOpen && (
          <Suspense fallback={null}>
            <MyScheduleModal
              workingHours={workingHours}
              weeklyAvailability={weeklyAvailability}
              saved={!!getPreferences().fixedScheduleSaved}
              onSave={handleSaveSchedule}
              onClose={() => setScheduleOpen(false)}
              onOpenBookingLink={sync ? () => setBookingLinkOpen(true) : null}
            />
          </Suspense>
        )}

        {departmentsOpen && (
          <Suspense fallback={null}>
            <DepartmentsModal
              departments={teamAreas}
              contacts={contacts}
              vacancies={vacancies}
              onAdd={handleAddArea}
              onRename={handleRenameDepartment}
              onMove={handleMoveDepartment}
              onRemove={handleRemoveDepartment}
              onClose={() => setDepartmentsOpen(false)}
            />
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

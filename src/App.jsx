import { useEffect, useMemo, useState } from 'react'
import { addDays, addMonths, addWeeks, format, subDays, subMonths, subWeeks } from 'date-fns'
import { es } from 'date-fns/locale'
import Sidebar from './components/Sidebar.jsx'
import CalendarHeader from './components/CalendarHeader.jsx'
import MonthView from './components/CalendarView/MonthView.jsx'
import WeekView from './components/CalendarView/WeekView.jsx'
import DayView from './components/CalendarView/DayView.jsx'
import EventModal from './components/EventModal.jsx'
import EventFormModal from './components/EventFormModal.jsx'
import FindSlotModal from './components/FindSlotModal.jsx'
import AvailabilityModal from './components/AvailabilityModal.jsx'
import ContactsView from './components/ContactsView.jsx'
import BackupModal from './components/BackupModal.jsx'
import ProposalModal from './components/ProposalModal.jsx'
import ReportView from './components/ReportView.jsx'
import TeamView from './components/TeamView.jsx'
import WeeklyAvailabilityModal from './components/WeeklyAvailabilityModal.jsx'
import ProjectsModal from './components/ProjectsModal.jsx'
import VacanciesView from './components/VacanciesView.jsx'
import DepartmentsModal from './components/DepartmentsModal.jsx'
import RecurrenceScopeDialog from './components/RecurrenceScopeDialog.jsx'
import SettingsModal from './components/SettingsModal.jsx'
import { refreshThisDevice } from './lib/push.js'
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
import { getPreferences, savePreferences, STORAGE_KEY as PREFERENCES_KEY } from './lib/preferences.js'
import { SchedulingContext } from './lib/schedulingContext.js'
import { RuleWarning, STORAGE_KEY as RULES_KEY, checkMeetingAgainstRules, getAllRules, rulesStore } from './lib/rules.js'
import { exceptionOf, expandEvent, expandEvents } from './lib/recurrence.js'
import {
  SCOPES,
  cancelOccurrencePatch,
  editOccurrencePatch,
  editSeriesPatch,
  findOccurrence,
  occurrenceKeyOf,
  restoreOccurrencePatch,
  splitSeries,
  truncateSeriesPatch,
} from './lib/seriesEdits.js'
import { bufferWarningsFor } from './lib/buffer.js'
import { meetingsMissingNotes, notesPatch } from './lib/notes.js'
import { getAllEvents } from './lib/localEvents.js'
import { deleteContactFiles } from './lib/files/contactFiles.js'
import { AREAS_KEY, getStoredTeamAreas, removeFromTeamPatch, saveTeamAreas } from './lib/team.js'
import { addDepartment, moveDepartment, removeDepartment, renameDepartment, resolveDepartments } from './lib/departments.js'
import { useSync, useSyncStatus } from './lib/sync/syncContext.js'
import { runPendingMigrations } from './lib/dataMigrations.js'
import { STORAGE_KEY as GROUPS_KEY, contactsWithoutGroup, getAllGroups, groupsStore } from './lib/groups.js'
import { EMPTY_FILTER, filterEvents } from './lib/calendarFilter.js'
import { STORAGE_KEY as PROJECTS_KEY, getAllProjects, projectsStore, unlinkProject } from './lib/projects.js'
import {
  INTERVIEW_TYPE,
  STORAGE_KEY as VACANCIES_KEY,
  candidatesOf,
  getAllVacancies,
  incorporate,
  interviewUpdates,
  newVacancy,
  planErasure,
  vacanciesStore,
  withStatus,
} from './lib/vacancies.js'
import { COMPACT_WEEK_DAYS, getVisibleRange } from './lib/dateHelpers.js'
import { useMediaQuery } from './lib/useMediaQuery.js'
import { computeSummary } from './lib/summary.js'
import {
  STORAGE_KEY as WEEKLY_AVAILABILITY_KEY,
  declareWeek,
  getAllWeeklyAvailability,
  pendingDeclaration,
  revertToHabitual,
  saveWeeklyAvailability,
  weekKeyOf,
} from './lib/weeklyAvailability.js'
import { contactDataFromText, participantFields, participantsOf } from './lib/contacts.js'
import './App.css'

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

// Reunión que hay que abrir al arrancar (la app se abrió desde una notificación: /?event=id).
function eventFromUrl(url) {
  try {
    const id = new URL(url, window.location.origin).searchParams.get('event')
    return id ? findOccurrence(getAllEvents(), id) : null
  } catch {
    return null
  }
}

function getHeaderLabel(currentDate, view, compactWeek) {
  if (view === 'week' && compactWeek) return formatCompactRange(currentDate, addDays(currentDate, COMPACT_WEEK_DAYS - 1))
  if (view === 'day') return format(currentDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })
  if (view === 'week') return format(currentDate, "'Semana del' d 'de' MMMM yyyy", { locale: es })
  return format(currentDate, 'MMMM yyyy', { locale: es })
}

export default function App() {
  const [section, setSection] = useState('calendar')
  const [selectedContactId, setSelectedContactId] = useState(null)
  const [selectedMemberId, setSelectedMemberId] = useState(null)
  const [selectedVacancyId, setSelectedVacancyId] = useState(null)
  const [selectedCandidateId, setSelectedCandidateId] = useState(null)
  const [launchEvent] = useState(() => eventFromUrl(window.location.href))
  const [view, setView] = useState('month')
  const [currentDate, setCurrentDate] = useState(() => (launchEvent ? new Date(launchEvent.start) : new Date()))
  const [selectedEvent, setSelectedEvent] = useState(launchEvent)
  // true si la reunión se abrió para escribir las notas (desde "Sin notas").
  const [notesFocus, setNotesFocus] = useState(false)
  const [formModal, setFormModal] = useState(null)
  // null = cerrado; { participants, meetingType } = abierto, con los participantes y el tipo de
  // reunión iniciales si los hay.
  const [findSlot, setFindSlot] = useState(null)
  const [availabilityOpen, setAvailabilityOpen] = useState(false)
  const [backupOpen, setBackupOpen] = useState(false)
  const [proposalModalId, setProposalModalId] = useState(null)
  // Semana abierta en "Disponibilidad de la semana" ('AAAA-MM-DD' del lunes) o null.
  const [weekModalKey, setWeekModalKey] = useState(null)
  const [projectsOpen, setProjectsOpen] = useState(false)
  const [departmentsOpen, setDepartmentsOpen] = useState(false)
  // Pregunta "¿Solo este día, este y los siguientes o toda la serie?": { action, title, resolve }.
  const [scopeAsk, setScopeAsk] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(id)
  }, [])

  // Notificaciones de los recordatorios: al pulsar una con la app ya abierta, el service worker
  // pide abrir la reunión; si la app se abrió desde la notificación, se limpia la dirección.
  useEffect(() => {
    if (new URL(window.location.href).searchParams.has('event')) window.history.replaceState(null, '', window.location.pathname)
    if (!('serviceWorker' in navigator)) return
    const onMessage = (message) => {
      if (message.data?.type !== 'cesi-open-event') return
      const occurrence = eventFromUrl(message.data.url)
      if (!occurrence) return
      setSection('calendar')
      setCurrentDate(new Date(occurrence.start))
      setSelectedEvent(occurrence)
      setNotesFocus(false)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
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
  const [preferences, reloadPreferences] = useStoredValue(PREFERENCES_KEY, getPreferences)
  const [rules, reloadRules] = useStoredValue(RULES_KEY, getAllRules)
  const [proposals, reloadProposals] = useStoredValue(PROPOSALS_KEY, getAllProposals)
  const [groups, reloadGroups] = useStoredValue(GROUPS_KEY, getAllGroups)
  const [storedAreas, reloadTeamAreas] = useStoredValue(AREAS_KEY, getStoredTeamAreas)
  const [weeklyAvailability, reloadWeeklyAvailability] = useStoredValue(WEEKLY_AVAILABILITY_KEY, getAllWeeklyAvailability)
  const [projects, reloadProjects] = useStoredValue(PROJECTS_KEY, getAllProjects)
  const [vacancies, reloadVacancies] = useStoredValue(VACANCIES_KEY, getAllVacancies)

  // Vuelve a leer todos los datos guardados (tras importar una copia o una migración).
  const reloadAllData = () => {
    reloadCalendar()
    reloadContacts()
    reloadPreferences()
    reloadRules()
    reloadProposals()
    reloadGroups()
    reloadTeamAreas()
    reloadWeeklyAvailability()
    reloadProjects()
    reloadVacancies()
  }

  // Departamentos (antes "áreas"): la lista guardada, la nueva lista si aún era la de ejemplo, y
  // los que usan miembros o vacantes aunque no estén en la lista.
  const teamAreas = useMemo(() => resolveDepartments(storedAreas, contacts, vacancies).list, [storedAreas, contacts, vacancies])
  // Esa lista se guarda (y se sincroniza) solo cuando ya se ha descargado la nube, para no pisar
  // con la lista de ejemplo de este dispositivo una lista ya cambiada en otro.
  const sync = useSync()
  const syncStatus = useSyncStatus()
  const canSaveDepartments = !sync || syncStatus.status === 'synced'

  // Avisos de este dispositivo: se renueva la suscripción si el navegador la ha cambiado.
  useEffect(() => {
    if (sync) refreshThisDevice().catch(() => {})
  }, [sync])
  useEffect(() => {
    if (!canSaveDepartments) return
    // Migraciones únicas de datos (departamentos, categorías → proyectos).
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
  const [calendarFilter, setCalendarFilter] = useState(EMPTY_FILTER)
  const visibleEvents = useMemo(() => filterEvents(events, calendarFilter), [events, calendarFilter])

  const scheduling = useMemo(
    () => ({
      rawEvents,
      workingHours,
      weeklyAvailability,
      preferences,
      rules,
      contacts,
      addContact,
      proposals,
      groups,
      projects,
      onManageProjects: () => setProjectsOpen(true),
    }),
    [rawEvents, workingHours, weeklyAvailability, preferences, rules, contacts, addContact, proposals, groups, projects],
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
        category: data.category,
        tags: data.tags,
        projectId: data.projectId || null,
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
    setSelectedEvent(null)
  }

  const handleCancelProposal = (proposalId) => {
    removeProposal(proposalId)
    setSelectedEvent(null)
  }

  // Ajustes → Recordatorios: aviso por defecto y zona horaria en la que se calculan los avisos.
  const handleSaveReminders = (patch) => {
    const current = getPreferences()
    savePreferences({ ...current, reminders: { ...current.reminders, ...patch } })
    reloadPreferences()
  }

  const handleSavePreferences = ({ workingHours: newHours, preferences: newPrefs, rules: newRules }) => {
    setWorkingHours(newHours)
    savePreferences(newPrefs)
    rulesStore.replaceAll(newRules)
    reloadPreferences()
    reloadRules()
  }

  // Reglas por tipo de reunión que incumpliría `meeting` (no bloquean: solo avisan).
  // `exclude`: la propia reunión ({ excludeSeriesId } o, si cambia solo un día, { excludeId }).
  const ruleViolationsFor = (meeting, exclude) => {
    const start = new Date(meeting.start)
    const dayStart = new Date(start)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)
    return checkMeetingAgainstRules(meeting, rules, expandEvents(rawEvents, dayStart, dayEnd), exclude)
  }

  // Avisos que no bloquean: reglas por tipo y margen con la reunión anterior o la siguiente.
  const warningsFor = (meeting, exclude) => [
    ...ruleViolationsFor(meeting, exclude).map((v) => ({ ...v, type: 'rule' })),
    ...bufferWarningsFor(meeting, rawEvents, preferences.bufferMinutes, exclude),
  ]

  // ---------------------------------------------------------------------------
  // Reuniones que se repiten: solo este día, este y los siguientes o toda la serie
  // ---------------------------------------------------------------------------

  // Pregunta a qué días se aplica el cambio. Devuelve el alcance (SCOPES) o null si se cancela.
  const askScope = (action, event) => new Promise((resolve) => setScopeAsk({ action, title: event.title, resolve }))

  const seriesOf = (occurrence) => getAllEvents().find((ev) => ev.id === occurrence.seriesId) || null

  // Qué se ignora al comprobar solapes, reglas y margen: solo ese día o toda la serie.
  const excludeFor = (event, scope) => (scope === SCOPES.THIS ? { excludeId: event.id } : { excludeSeriesId: event.seriesId })

  // Guarda `changes` ({ start, end, title, ... }) en la reunión de `occurrence` con ese alcance.
  const applyOccurrenceChange = (occurrence, changes, scope) => {
    const series = seriesOf(occurrence)
    if (!series) return
    const iso = (d) => (d instanceof Date ? d.toISOString() : d)
    if (!series.recurrence) {
      editEvent(series.id, { ...changes, start: iso(changes.start ?? series.start), end: iso(changes.end ?? series.end) })
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
        addEvent(split.newEvent)
        return
      }
    }
    editEvent(series.id, editSeriesPatch(series, occurrence, changes))
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

  const openEvent = (event, { focusNotes = false } = {}) => {
    setSelectedEvent(event)
    setNotesFocus(focusNotes)
  }

  // Guarda las notas de la ocurrencia: en notesByDate si la reunión se repite, si no en notes.
  const handleSaveNotes = (occurrence, text) => {
    const series = getAllEvents().find((ev) => ev.id === occurrence.seriesId)
    if (!series) return
    editEvent(series.id, notesPatch(series, occurrence, text))
  }

  const summary = useMemo(
    () => computeSummary(rawEvents, workingHours, now, weeklyAvailability),
    [rawEvents, workingHours, now, weeklyAvailability],
  )

  const pendingWeek = useMemo(() => pendingDeclaration(now, weeklyAvailability), [now, weeklyAvailability])

  const handleDeclareWeek = (key, week) => {
    saveWeeklyAvailability(declareWeek(getAllWeeklyAvailability(), key, week))
    reloadWeeklyAvailability()
  }

  // "Volver al horario habitual" y "Usar mi horario habitual" (descartar el aviso de esa semana).
  const handleRevertWeek = (key) => {
    saveWeeklyAvailability(revertToHabitual(getAllWeeklyAvailability(), key))
    reloadWeeklyAvailability()
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

  const handleCreateProject = (data) => {
    projectsStore.create(data)
    reloadProjects()
  }

  const handleUpdateProject = (id, patch) => {
    projectsStore.update(id, patch)
    reloadProjects()
  }

  // Al borrar un proyecto sus reuniones (y propuestas) se conservan, sin proyecto.
  const handleDeleteProject = (id) => {
    const { eventPatches, proposalIds } = unlinkProject(id, rawEvents, proposals)
    for (const { id: eventId, patch } of eventPatches) editEvent(eventId, patch)
    for (const proposalId of proposalIds) proposalsStore.update(proposalId, { projectId: null })
    projectsStore.remove(id)
    reloadProjects()
    reloadProposals()
    if (calendarFilter.project === id) setCalendarFilter({ ...calendarFilter, project: null })
  }

  // ---------------------------------------------------------------------------
  // Vacantes y candidatos
  // ---------------------------------------------------------------------------

  // Al crear (o confirmar) una entrevista, los candidatos en "nuevo" pasan a "entrevista".
  const applyInterviewUpdates = (meeting) => {
    for (const { id, candidacy } of interviewUpdates(meeting, contacts)) editContact(id, { candidacy })
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

  // Al borrar una vacante se borran también sus candidatos (contacto, CV y notas).
  const handleDeleteVacancy = (id) => {
    for (const c of candidatesOf(id, contacts)) removeContact(c.id)
    vacanciesStore.remove(id)
    reloadVacancies()
  }

  const handleCandidateStatus = (contact, status) => editContact(contact.id, { candidacy: withStatus(contact.candidacy, status) })

  const handleFindInterviewSlot = (contact) =>
    setFindSlot({ participants: { participantIds: [contact.id], guests: [] }, meetingType: INTERVIEW_TYPE })

  // Candidato → miembro del equipo: perfil (con "Se incorporó como…" en la trayectoria), vacante cubierta y, si quedan
  // otros candidatos, se ofrece descartarlos.
  const handleIncorporate = (contact, vacancy, { contactPatch, teamProfile }) => {
    const result = incorporate({ contact, vacancy, teamProfile, contacts })
    editContact(contact.id, { ...contactPatch, ...result.contactPatch })
    vacanciesStore.update(vacancy.id, result.vacancyPatch)
    reloadVacancies()
    const n = result.remaining.length
    if (n > 0) {
      const who = result.remaining.map((c) => `• ${c.name}`).join('\n')
      const question = n === 1 ? 'Queda 1 candidato en esta vacante' : `Quedan ${n} candidatos en esta vacante`
      if (window.confirm(`${question}:\n${who}\n\n¿Marcarlos como descartados?`)) {
        for (const c of result.remaining) handleCandidateStatus(c, 'discarded')
      }
    }
  }

  // Protección de datos: borra los datos personales de los candidatos descartados hace más de
  // 6 meses y deja un registro anónimo en su vacante. Siempre tras la confirmación del usuario.
  const handleEraseExpired = (candidates) => {
    const plan = planErasure(candidates, getAllEvents(), vacancies, new Date(), proposals)
    for (const { id, patch } of plan.eventPatches) editEvent(id, patch)
    for (const { id, patch } of plan.proposalPatches) proposalsStore.update(id, patch)
    for (const [id, erasedCandidates] of Object.entries(plan.vacancyPatches)) vacanciesStore.update(id, { erasedCandidates })
    for (const id of plan.contactIds) removeContact(id)
    reloadProposals()
    reloadVacancies()
  }

  const handleOpenCandidate = (contactId) => {
    const contact = contacts.find((c) => c.id === contactId)
    setSelectedEvent(null)
    setSelectedVacancyId(contact?.candidacy?.vacancyId || null)
    setSelectedCandidateId(contactId)
    setSection('vacancies')
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

  // Perfil de equipo: los datos de contacto (foto, email, teléfono) se guardan en el propio contacto.
  const handleSaveTeamProfile = (contactId, { contactPatch, teamProfile }) => {
    editContact(contactId, { ...contactPatch, teamProfile })
  }

  const handleOpenTeamMember = (contactId) => {
    setSelectedEvent(null)
    setSelectedMemberId(contactId)
    setSection('team')
  }

  const handleFindSlotWithContact = (contact) => setFindSlot({ participants: { participantIds: [contact.id], guests: [] } })

  const handleNewMeetingWithContact = (contact) =>
    setFormModal({ mode: 'meeting', editingEvent: null, prefill: { participantIds: [contact.id], guests: [] } })

  const handleOpenContact = (contactId) => {
    if (contacts.find((c) => c.id === contactId)?.candidacy) {
      handleOpenCandidate(contactId)
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
    const conflict = checkConflict(newStart, newEnd, exclude)
    if (conflict) {
      window.alert('Esta franja ya está ocupada.')
      return
    }
    const violations = warningsFor({ ...event, start: newStart, end: newEnd }, exclude)
    if (violations.length > 0) {
      const reasons = violations.map((v) => `• ${v.message}`).join('\n')
      if (!window.confirm(`${reasons}\n\n¿Guardar igualmente?`)) return
    }
    applyOccurrenceChange(event, { start: newStart, end: newEnd }, scope)
  }

  const handleFindSlotPick = (slot, meetingType, participants) => {
    setFindSlot(null)
    const prefill = { start: slot.start, end: slot.end }
    if (participants && (participants.participantIds.length || participants.guests.length)) {
      prefill.participantIds = participants.participantIds
      prefill.guests = participants.guests
    }
    if (meetingType?.category) prefill.category = meetingType.category
    if (meetingType?.tags?.length) prefill.tags = meetingType.tags
    setFormModal({ mode: 'meeting', editingEvent: null, prefill })
  }

  const handleFormSubmit = async (values, { ignoreRules = false } = {}) => {
    const { start, end } = values
    const editing = formModal?.editingEvent
    const exclude = editing ? excludeFor(editing, formModal.scope) : {}
    const conflict = checkConflict(start, end, exclude)
    if (conflict) {
      throw new Error('Esta franja ya está ocupada.')
    }
    if (!ignoreRules) {
      const violations = warningsFor(values, exclude)
      if (violations.length > 0) throw new RuleWarning(violations)
    }

    const data = { ...values, start: start.toISOString(), end: end.toISOString() }
    if (editing) {
      applyOccurrenceChange(editing, values, formModal.scope)
    } else {
      addEvent(data)
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
          onSectionChange={setSection}
          onOpenBackup={() => setBackupOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          proposals={proposalItems}
          onOpenProposal={setProposalModalId}
          missingNotes={missingNotes}
          onOpenMissingNotes={(ev) => openEvent(ev, { focusNotes: true })}
          pendingWeek={pendingWeek}
          onDeclareWeek={setWeekModalKey}
          onDismissWeek={handleRevertWeek}
        />

        {section === 'contacts' && (
          <div className="app-main">
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
              onOpenTeamMember={handleOpenTeamMember}
              onOpenCandidate={handleOpenCandidate}
            />
          </div>
        )}

        {section === 'vacancies' && (
          <div className="app-main">
            <VacanciesView
              vacancies={vacancies}
              contacts={contacts}
              rawEvents={rawEvents}
              now={now}
              areas={teamAreas}
              groups={groups}
              onAddArea={handleAddArea}
              onManageDepartments={() => setDepartmentsOpen(true)}
              selectedVacancyId={selectedVacancyId}
              onSelectVacancy={setSelectedVacancyId}
              selectedCandidateId={selectedCandidateId}
              onSelectCandidate={setSelectedCandidateId}
              onCreateVacancy={handleCreateVacancy}
              onUpdateVacancy={handleUpdateVacancy}
              onDeleteVacancy={handleDeleteVacancy}
              onAddCandidate={addContact}
              onEditCandidate={editContact}
              onRemoveCandidate={removeContact}
              onCandidateStatus={handleCandidateStatus}
              onFindInterviewSlot={handleFindInterviewSlot}
              onIncorporate={handleIncorporate}
              onEraseExpired={handleEraseExpired}
              onOpenEvent={openEvent}
              onOpenTeamMember={handleOpenTeamMember}
            />
          </div>
        )}

        {section === 'team' && (
          <div className="app-main">
            <TeamView
              contacts={contacts}
              groups={groups}
              rawEvents={rawEvents}
              now={now}
              areas={teamAreas}
              selectedMemberId={selectedMemberId}
              onSelectMember={setSelectedMemberId}
              onSaveProfile={handleSaveTeamProfile}
              onRemoveFromTeam={(id) => editContact(id, removeFromTeamPatch(contacts.find((c) => c.id === id)))}
              onAddArea={handleAddArea}
              onManageDepartments={() => setDepartmentsOpen(true)}
              onOpenEvent={openEvent}
              onFindSlot={handleFindSlotWithContact}
              onNewMeeting={handleNewMeetingWithContact}
              onOpenContact={handleOpenContact}
            />
          </div>
        )}

        {section === 'report' && (
          <div className="app-main">
            <ReportView
              rawEvents={rawEvents}
              workingHours={workingHours}
              weeklyAvailability={weeklyAvailability}
              contacts={contacts}
              groups={groups}
              projects={projects}
              now={now}
              onOpenEvent={openEvent}
            />
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
              onOpenAvailability={() => setAvailabilityOpen(true)}
              onOpenWeekAvailability={() => setWeekModalKey(weekKeyOf(currentDate))}
              filter={calendarFilter}
              onFilterChange={setCalendarFilter}
              rawEvents={rawEvents}
              projects={projects}
              onManageProjects={() => setProjectsOpen(true)}
            />

            <div className="app-calendar-body">
              {view === 'month' && (
                <MonthView
                  currentDate={currentDate}
                  events={visibleEvents}
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
                  events={visibleEvents}
                  onSelectEvent={openEvent}
                  onSlotClick={handleSlotClick}
                  onMoveEvent={handleMoveOrResize}
                  onResizeEvent={handleMoveOrResize}
                />
              )}
              {view === 'day' && (
                <DayView
                  currentDate={currentDate}
                  events={visibleEvents}
                  onSelectEvent={openEvent}
                  onSlotClick={handleSlotClick}
                  onMoveEvent={handleMoveOrResize}
                  onResizeEvent={handleMoveOrResize}
                />
              )}
            </div>
          </div>
        )}

        <EventModal
          key={selectedEvent?.id || 'none'}
          event={selectedEvent}
          contacts={contacts}
          now={now}
          focusNotes={notesFocus}
          onSaveNotes={handleSaveNotes}
          onClose={() => setSelectedEvent(null)}
          onOpenContact={handleOpenContact}
          onSaveGuestAsContact={handleSaveGuestAsContact}
          onEdit={handleEditEvent}
          onDelete={handleDeleteEvent}
          onRestoreOccurrence={handleRestoreOccurrence}
          onDuplicate={handleDuplicateEvent}
          onConfirmOption={handleConfirmOption}
          onCancelProposal={handleCancelProposal}
        />

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
            initialDurationMinutes={60}
            initialParticipants={findSlot.participants}
            initialMeetingType={findSlot.meetingType}
            onPick={handleFindSlotPick}
            onCreateProposal={handleCreateProposal}
            onClose={() => setFindSlot(null)}
          />
        )}

        {proposalModalId && proposals.some((p) => p.id === proposalModalId) && (
          <ProposalModal
            proposal={proposals.find((p) => p.id === proposalModalId)}
            onConfirmOption={handleConfirmOption}
            onCancelProposal={handleCancelProposal}
            onClose={() => setProposalModalId(null)}
          />
        )}

        {backupOpen && <BackupModal onClose={() => setBackupOpen(false)} onRestored={handleBackupRestored} />}

        {settingsOpen && (
          <SettingsModal preferences={preferences} onSaveReminders={handleSaveReminders} onClose={() => setSettingsOpen(false)} />
        )}

        {weekModalKey && (
          <WeeklyAvailabilityModal
            initialKey={weekModalKey}
            workingHours={workingHours}
            weeks={weeklyAvailability}
            onSave={handleDeclareWeek}
            onRevert={handleRevertWeek}
            onClose={() => setWeekModalKey(null)}
          />
        )}

        {availabilityOpen && (
          <AvailabilityModal
            workingHours={workingHours}
            preferences={preferences}
            rules={rules}
            onSave={handleSavePreferences}
            onClose={() => setAvailabilityOpen(false)}
          />
        )}

        {departmentsOpen && (
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

        {projectsOpen && (
          <ProjectsModal
            projects={projects}
            rawEvents={rawEvents}
            onCreate={handleCreateProject}
            onUpdate={handleUpdateProject}
            onDelete={handleDeleteProject}
            onClose={() => setProjectsOpen(false)}
          />
        )}
      </div>
    </SchedulingContext.Provider>
  )
}

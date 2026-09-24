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
import { expandEvents } from './lib/recurrence.js'
import { bufferWarningsFor } from './lib/buffer.js'
import { meetingsMissingNotes, notesPatch } from './lib/notes.js'
import { getAllEvents } from './lib/localEvents.js'
import { deleteContactFiles } from './lib/files/contactFiles.js'
import { AREAS_KEY, addArea, getTeamAreas, saveTeamAreas } from './lib/team.js'
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
  const [view, setView] = useState('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedEvent, setSelectedEvent] = useState(null)
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
  const [preferences, reloadPreferences] = useStoredValue(PREFERENCES_KEY, getPreferences)
  const [rules, reloadRules] = useStoredValue(RULES_KEY, getAllRules)
  const [proposals, reloadProposals] = useStoredValue(PROPOSALS_KEY, getAllProposals)
  const [groups, reloadGroups] = useStoredValue(GROUPS_KEY, getAllGroups)
  const [teamAreas, reloadTeamAreas] = useStoredValue(AREAS_KEY, getTeamAreas)
  const [weeklyAvailability, reloadWeeklyAvailability] = useStoredValue(WEEKLY_AVAILABILITY_KEY, getAllWeeklyAvailability)
  const [projects, reloadProjects] = useStoredValue(PROJECTS_KEY, getAllProjects)
  const [vacancies, reloadVacancies] = useStoredValue(VACANCIES_KEY, getAllVacancies)
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

  const handleSavePreferences = ({ workingHours: newHours, preferences: newPrefs, rules: newRules }) => {
    setWorkingHours(newHours)
    savePreferences(newPrefs)
    rulesStore.replaceAll(newRules)
    reloadPreferences()
    reloadRules()
  }

  // Reglas por tipo de reunión que incumpliría `meeting` (no bloquean: solo avisan).
  const ruleViolationsFor = (meeting, excludeSeriesId) => {
    const start = new Date(meeting.start)
    const dayStart = new Date(start)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)
    return checkMeetingAgainstRules(meeting, rules, expandEvents(rawEvents, dayStart, dayEnd), { excludeSeriesId })
  }

  // Avisos que no bloquean: reglas por tipo y margen con la reunión anterior o la siguiente.
  const warningsFor = (meeting, excludeSeriesId) => [
    ...ruleViolationsFor(meeting, excludeSeriesId).map((v) => ({ ...v, type: 'rule' })),
    ...bufferWarningsFor(meeting, rawEvents, preferences.bufferMinutes, { excludeSeriesId }),
  ]

  const handleBackupRestored = () => {
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
    const { eventIds, proposalIds } = unlinkProject(id, rawEvents, proposals)
    for (const eventId of eventIds) editEvent(eventId, { projectId: null })
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

  // Candidato → miembro del equipo: perfil con su primer hito, vacante cubierta y, si quedan
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
    saveTeamAreas(addArea(teamAreas, name))
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
    editEvent(event.seriesId, fields)
    setSelectedEvent((ev) => (ev ? { ...ev, ...fields } : ev))
  }

  const handleSlotClick = (day, hour) => {
    const start = new Date(day)
    start.setHours(hour, 0, 0, 0)
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    setFormModal({ mode: 'meeting', editingEvent: null, prefill: { start, end } })
  }

  const handleEditEvent = (event) => {
    setSelectedEvent(null)
    setFormModal({ mode: event.isUnavailable ? 'unavailable' : 'meeting', editingEvent: event, prefill: null })
  }

  const handleDuplicateEvent = (event) => {
    setSelectedEvent(null)
    setFormModal({ mode: event.isUnavailable ? 'unavailable' : 'meeting', editingEvent: null, prefill: event })
  }

  const handleDeleteEvent = async (event) => {
    removeEvent(event.seriesId)
  }

  const handleMoveOrResize = (event, newStart, newEnd) => {
    const conflict = checkConflict(newStart, newEnd, { excludeSeriesId: event.seriesId })
    if (conflict) {
      window.alert('Esta franja ya está ocupada.')
      return
    }
    const violations = warningsFor({ ...event, start: newStart, end: newEnd }, event.seriesId)
    if (violations.length > 0) {
      const reasons = violations.map((v) => `• ${v.message}`).join('\n')
      if (!window.confirm(`${reasons}\n\n¿Guardar igualmente?`)) return
    }
    editEvent(event.seriesId, { start: newStart.toISOString(), end: newEnd.toISOString() })
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
    const excludeSeriesId = formModal?.editingEvent?.seriesId
    const conflict = checkConflict(start, end, { excludeSeriesId })
    if (conflict) {
      throw new Error('Esta franja ya está ocupada.')
    }
    if (!ignoreRules) {
      const violations = warningsFor(values, excludeSeriesId)
      if (violations.length > 0) throw new RuleWarning(violations)
    }

    const data = { ...values, start: start.toISOString(), end: end.toISOString() }
    if (formModal.editingEvent) {
      editEvent(formModal.editingEvent.seriesId, data)
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
              onAddArea={handleAddArea}
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
              onRemoveFromTeam={(id) => editContact(id, { teamProfile: null })}
              onAddArea={handleAddArea}
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
          onDuplicate={handleDuplicateEvent}
          onConfirmOption={handleConfirmOption}
          onCancelProposal={handleCancelProposal}
        />

        {formModal && (
          <EventFormModal
            mode={formModal.mode}
            initialEvent={formModal.editingEvent}
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

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
import ConverterView from './components/ConverterView.jsx'
import { useLocalCalendar } from './hooks/useLocalCalendar.js'
import { useContacts } from './hooks/useContacts.js'
import { useStoredValue } from './hooks/useStoredValue.js'
import { getPreferences, savePreferences, STORAGE_KEY as PREFERENCES_KEY } from './lib/preferences.js'
import { SchedulingContext } from './lib/schedulingContext.js'
import { RuleWarning, STORAGE_KEY as RULES_KEY, checkMeetingAgainstRules, getAllRules, rulesStore } from './lib/rules.js'
import { expandEvents } from './lib/recurrence.js'
import { COMPACT_WEEK_DAYS, getVisibleRange } from './lib/dateHelpers.js'
import { useMediaQuery } from './lib/useMediaQuery.js'
import { computeSummary } from './lib/summary.js'
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
  const [view, setView] = useState('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [formModal, setFormModal] = useState(null)
  const [findSlotOpen, setFindSlotOpen] = useState(false)
  const [availabilityOpen, setAvailabilityOpen] = useState(false)
  const [backupOpen, setBackupOpen] = useState(false)
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

  const { contacts, addContact, editContact, removeContact, refresh: reloadContacts } = useContacts()
  const [preferences, reloadPreferences] = useStoredValue(PREFERENCES_KEY, getPreferences)
  const [rules, reloadRules] = useStoredValue(RULES_KEY, getAllRules)

  const scheduling = useMemo(
    () => ({ rawEvents, workingHours, preferences, rules, contacts, addContact }),
    [rawEvents, workingHours, preferences, rules, contacts, addContact],
  )

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

  const handleBackupRestored = () => {
    reloadCalendar()
    reloadContacts()
    reloadPreferences()
    reloadRules()
    setSelectedEvent(null)
    setSelectedContactId(null)
  }

  const summary = useMemo(() => computeSummary(rawEvents, workingHours, now), [rawEvents, workingHours, now])

  const handleNewMeeting = () => setFormModal({ mode: 'meeting', editingEvent: null, prefill: null })

  const handleNewMeetingWithContact = (contact) =>
    setFormModal({ mode: 'meeting', editingEvent: null, prefill: { participantIds: [contact.id], guests: [] } })

  const handleOpenContact = (contactId) => {
    setSelectedEvent(null)
    setSelectedContactId(contactId)
    setSection('contacts')
  }

  // Convierte un invitado suelto en contacto y lo enlaza por id en la reunión.
  const handleSaveGuestAsContact = (event, guest) => {
    const contact = addContact(contactDataFromText(guest))
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
    const violations = ruleViolationsFor({ ...event, start: newStart, end: newEnd }, event.seriesId)
    if (violations.length > 0) {
      const reasons = violations.map((v) => `• ${v.message}`).join('\n')
      if (!window.confirm(`${reasons}\n\n¿Guardar igualmente?`)) return
    }
    editEvent(event.seriesId, { start: newStart.toISOString(), end: newEnd.toISOString() })
  }

  const handleFindSlotPick = (slot, meetingType) => {
    setFindSlotOpen(false)
    const prefill = { start: slot.start, end: slot.end }
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
      const violations = ruleViolationsFor(values, excludeSeriesId)
      if (violations.length > 0) throw new RuleWarning(violations)
    }

    const data = { ...values, start: start.toISOString(), end: end.toISOString() }
    if (formModal.editingEvent) {
      editEvent(formModal.editingEvent.seriesId, data)
    } else {
      addEvent(data)
    }
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
        />

        {section === 'contacts' && (
          <div className="app-main">
            <ContactsView
              contacts={contacts}
              rawEvents={rawEvents}
              now={now}
              selectedContactId={selectedContactId}
              onSelectContact={setSelectedContactId}
              onAddContact={addContact}
              onEditContact={editContact}
              onRemoveContact={removeContact}
              onOpenEvent={setSelectedEvent}
              onNewMeetingWithContact={handleNewMeetingWithContact}
            />
          </div>
        )}

        {section === 'converter' && (
          <div className="app-main">
            <ConverterView />
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
              onFindSlot={() => setFindSlotOpen(true)}
              onOpenAvailability={() => setAvailabilityOpen(true)}
            />

            <div className="app-calendar-body">
              {view === 'month' && (
                <MonthView
                  currentDate={currentDate}
                  events={events}
                  onSelectEvent={setSelectedEvent}
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
                  onSelectEvent={setSelectedEvent}
                  onSlotClick={handleSlotClick}
                  onMoveEvent={handleMoveOrResize}
                  onResizeEvent={handleMoveOrResize}
                />
              )}
              {view === 'day' && (
                <DayView
                  currentDate={currentDate}
                  events={events}
                  onSelectEvent={setSelectedEvent}
                  onSlotClick={handleSlotClick}
                  onMoveEvent={handleMoveOrResize}
                  onResizeEvent={handleMoveOrResize}
                />
              )}
            </div>
          </div>
        )}

        <EventModal
          event={selectedEvent}
          contacts={contacts}
          onClose={() => setSelectedEvent(null)}
          onOpenContact={handleOpenContact}
          onSaveGuestAsContact={handleSaveGuestAsContact}
          onEdit={handleEditEvent}
          onDelete={handleDeleteEvent}
          onDuplicate={handleDuplicateEvent}
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

        {findSlotOpen && (
          <FindSlotModal initialDurationMinutes={60} onPick={handleFindSlotPick} onClose={() => setFindSlotOpen(false)} />
        )}

        {backupOpen && <BackupModal onClose={() => setBackupOpen(false)} onRestored={handleBackupRestored} />}

        {availabilityOpen && (
          <AvailabilityModal
            workingHours={workingHours}
            preferences={preferences}
            rules={rules}
            onSave={handleSavePreferences}
            onClose={() => setAvailabilityOpen(false)}
          />
        )}
      </div>
    </SchedulingContext.Provider>
  )
}

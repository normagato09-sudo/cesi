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
import { useLocalCalendar } from './hooks/useLocalCalendar.js'
import { getVisibleRange } from './lib/dateHelpers.js'
import { computeSummary } from './lib/summary.js'
import './App.css'

function getHeaderLabel(currentDate, view) {
  if (view === 'day') return format(currentDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })
  if (view === 'week') return format(currentDate, "'Semana del' d 'de' MMMM yyyy", { locale: es })
  return format(currentDate, 'MMMM yyyy', { locale: es })
}

export default function App() {
  const [view, setView] = useState('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [formModal, setFormModal] = useState(null)
  const [findSlotOpen, setFindSlotOpen] = useState(false)
  const [availabilityOpen, setAvailabilityOpen] = useState(false)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(id)
  }, [])

  const range = useMemo(() => getVisibleRange(currentDate, view), [currentDate, view])

  const { rawEvents, events, workingHours, setWorkingHours, checkConflict, addEvent, editEvent, removeEvent } =
    useLocalCalendar(range)

  const summary = useMemo(() => computeSummary(rawEvents, workingHours, now), [rawEvents, workingHours, now])

  const handleNewMeeting = () => setFormModal({ mode: 'meeting', editingEvent: null, prefill: null })

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
    editEvent(event.seriesId, { start: newStart.toISOString(), end: newEnd.toISOString() })
  }

  const handleFindSlotPick = (slot) => {
    setFindSlotOpen(false)
    setFormModal({ mode: 'meeting', editingEvent: null, prefill: { start: slot.start, end: slot.end } })
  }

  const handleFormSubmit = async (values) => {
    const { start, end } = values
    const excludeSeriesId = formModal?.editingEvent?.seriesId
    const conflict = checkConflict(start, end, { excludeSeriesId })
    if (conflict) {
      throw new Error('Esta franja ya está ocupada.')
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
    else if (view === 'week') setCurrentDate((d) => subWeeks(d, 1))
    else setCurrentDate((d) => subDays(d, 1))
  }

  const handleNext = () => {
    if (view === 'month') setCurrentDate((d) => addMonths(d, 1))
    else if (view === 'week') setCurrentDate((d) => addWeeks(d, 1))
    else setCurrentDate((d) => addDays(d, 1))
  }

  const handleToday = () => setCurrentDate(new Date())

  return (
    <div className="app">
      <Sidebar summary={summary} now={now} />

      <div className="app-main">
        <CalendarHeader
          label={getHeaderLabel(currentDate, view)}
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

      <EventModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
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
          rawEvents={rawEvents}
          onClose={() => setFormModal(null)}
          onSubmit={handleFormSubmit}
        />
      )}

      {findSlotOpen && (
        <FindSlotModal rawEvents={rawEvents} initialDurationMinutes={60} onPick={handleFindSlotPick} onClose={() => setFindSlotOpen(false)} />
      )}

      {availabilityOpen && (
        <AvailabilityModal
          workingHours={workingHours}
          onSave={setWorkingHours}
          onClose={() => setAvailabilityOpen(false)}
        />
      )}
    </div>
  )
}

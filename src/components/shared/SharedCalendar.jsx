import { useCallback, useEffect, useMemo, useState } from 'react'
import CalendarHeader from '../CalendarHeader.jsx'
import MonthView from '../CalendarView/MonthView.jsx'
import WeekView from '../CalendarView/WeekView.jsx'
import DayView from '../CalendarView/DayView.jsx'
import MeetingFormModal from './MeetingFormModal.jsx'
import MeetingDetailModal from './MeetingDetailModal.jsx'
import ClassDetailModal from './ClassDetailModal.jsx'
import { errorText, listMyClasses, listMyMeetings, memberCalendarEvents } from '../../lib/sharedCalendar'
import { getVisibleRange } from '../../lib/dateHelpers'
import { headerLabel, readView, stepDate, writeView } from '../../lib/calendarNav'
import { eventsInZone, fromWall, realEvent, toWall } from '../../lib/zoneView'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { SchedulingContext } from '../../lib/schedulingContext'
import { zoneShort } from '../../lib/studentPortal'
import { addDays, format, subDays } from 'date-fns'
import './SharedCalendar.css'
import '../../App.css'

const EMPTY = { meetings: [], classes: [] }
// Las vistas del calendario leen mis contactos (de la ceo); aquí no hay.
const NO_SCHEDULING = { rawEvents: [], workingHours: [], contacts: [], proposals: [], groups: [] }
// El calendario de una persona no marca horario de trabajo.
const NO_HOURS = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, enabled: false, slots: [] }))

// Calendario de una persona (alumno o equipo): el mismo que el de la ceo (Mes, Semana, Día; la
// vista elegida se recuerda), en la zona de su perfil, con sus reuniones compartidas y sus clases.
// «Nueva reunión» (o pulsar un hueco) abre el formulario, y al pulsar algo, su ficha.
// asId + readOnly: «Ver como» de la ceo (lee el calendario de esa persona, sin poder cambiar nada).
export default function SharedCalendar({ client, meId, zone, asId = null, readOnly = false }) {
  const compactWeek = useMediaQuery('(max-width: 640px)')
  const [view, setViewState] = useState(() => readView())
  const [currentDate, setCurrentDate] = useState(() => toWall(new Date(), zone))
  const [data, setData] = useState(null) // { meetings, classes }
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)
  const [open, setOpen] = useState(null) // item
  const [form, setForm] = useState(null) // { meeting, prefill } (meeting null: nueva)

  const setView = (next) => {
    writeView(next)
    setViewState(next)
  }

  // Lo visible (en la hora de su zona), con un día más a cada lado.
  const range = useMemo(() => {
    const r = getVisibleRange(currentDate, view, { compactWeek })
    return { start: fromWall(subDays(r.start, 1), zone), end: fromWall(addDays(r.end, 1), zone) }
  }, [currentDate, view, compactWeek, zone])

  useEffect(() => {
    if (!client) return
    let active = true
    Promise.all([listMyMeetings(client, range.start, range.end, asId), listMyClasses(client, range.start, range.end, asId)]).then(
      ([meetings, classes]) => {
        if (!active) return
        setData({ meetings: meetings || [], classes: classes || [] })
        setError(null)
      },
      (err) => active && setError(errorText(err)),
    )
    return () => {
      active = false
    }
  }, [client, range, asId, reload])

  const refresh = useCallback(() => setReload((n) => n + 1), [])
  // Sin cliente (vista previa de un ejemplo, sin cuenta): el calendario vacío.
  const shown = client ? data : EMPTY
  const events = useMemo(
    () => (shown ? eventsInZone(memberCalendarEvents(shown.meetings, shown.classes, asId || meId), zone) : []),
    [shown, meId, asId, zone],
  )

  const openEvent = (ev) => setOpen(realEvent(ev).item)
  const newMeeting = readOnly || !client ? null : (prefill = null) => setForm({ meeting: null, prefill })
  const onSlotClick = newMeeting
    ? (day, hour) => {
        const start = new Date(day)
        start.setHours(hour, 0, 0, 0)
        newMeeting({ date: format(start, 'yyyy-MM-dd'), time: format(start, 'HH:mm') })
      }
    : () => {}

  return (
    <SchedulingContext.Provider value={NO_SCHEDULING}>
      <div className="sc-root sc-calendar">
        <CalendarHeader
          label={headerLabel(currentDate, view, compactWeek)}
          view={view}
          onViewChange={setView}
          onPrev={() => setCurrentDate((d) => stepDate(d, view, compactWeek, -1))}
          onNext={() => setCurrentDate((d) => stepDate(d, view, compactWeek, 1))}
          onToday={() => setCurrentDate(toWall(new Date(), zone))}
          onNewMeeting={newMeeting ? () => newMeeting() : null}
          note={`Horas en tu zona: ${zoneShort(zone)}`}
        />

        {error && <p className="sc-message error">{error}</p>}
        {!error && !shown && <p className="sc-message">Cargando…</p>}

        <div className="app-calendar-body">
          {view === 'month' && (
            <MonthView
              currentDate={currentDate}
              events={events}
              onSelectEvent={openEvent}
              onMoveEvent={() => {}}
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
              workingHours={NO_HOURS}
              onSelectEvent={openEvent}
              onSlotClick={onSlotClick}
              onMoveEvent={() => {}}
              onResizeEvent={() => {}}
            />
          )}
          {view === 'day' && (
            <DayView
              currentDate={currentDate}
              events={events}
              workingHours={NO_HOURS}
              onSelectEvent={openEvent}
              onSlotClick={onSlotClick}
              onMoveEvent={() => {}}
              onResizeEvent={() => {}}
            />
          )}
        </div>

        {open?.kind === 'meeting' && (
          <MeetingDetailModal
            client={client}
            meeting={open.meeting}
            meId={meId}
            zone={zone}
            readOnly={readOnly}
            onClose={() => setOpen(null)}
            onChanged={() => {
              setOpen(null)
              refresh()
            }}
            onEdit={(meeting) => {
              setOpen(null)
              setForm({ meeting, prefill: null })
            }}
          />
        )}
        {open?.kind === 'class' && (
          <ClassDetailModal client={client} cls={open.cls} zone={zone} readOnly={readOnly} onClose={() => setOpen(null)} onChanged={refresh} />
        )}
        {form && (
          <MeetingFormModal
            client={client}
            meId={meId}
            zone={zone}
            meeting={form.meeting}
            prefill={form.prefill}
            onClose={() => setForm(null)}
            onSaved={() => {
              setForm(null)
              refresh()
            }}
          />
        )}
      </div>
    </SchedulingContext.Provider>
  )
}

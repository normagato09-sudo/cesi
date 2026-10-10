import { useEffect, useRef, useState } from 'react'
import { format, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { NotebookPen } from 'lucide-react'
import { getMonthGridDays, isSameDay, isSameMonth } from '../../lib/dateHelpers'
import { isEventOnDay } from '../../lib/eventLayout'
import { colorForEvent } from '../../lib/eventStyle'
import { eventTitle, isMarkedDayOff, kindLabel, unavailableKindOf } from '../../lib/unavailableKinds'
import UnavailableIcon from '../UnavailableIcon.jsx'
import { hasNotes } from '../../lib/notes'
import { dragThresholdFor } from '../../lib/dragThreshold'
import { cellIndexFromPoint } from '../../lib/monthGrid'
import { canStartDrag, trackDrag } from '../../lib/pointerDrag'
import { useMediaQuery } from '../../lib/useMediaQuery'
import DayEventsModal from '../DayEventsModal.jsx'
import EventPreview from './EventPreview.jsx'
import { useEventPreview } from '../../hooks/useEventPreview'
import './MonthView.css'
import { NOT_ATTENDING_LABEL } from '../../lib/notAttending'

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export default function MonthView({ currentDate, events, onSelectEvent, onSelectDay, onMoveEvent }) {
  const { preview, bind: bindPreview, press: pressPreview, hide: hidePreview } = useEventPreview()
  const isMobile = useMediaQuery('(max-width: 640px)')
  const MAX_VISIBLE_DOTS = isMobile ? 4 : 6
  const days = getMonthGridDays(currentDate)
  const today = new Date()
  const gridRef = useRef(null)
  const dragDataRef = useRef(null)
  const draggedRef = useRef(false)
  const dragPreviewRef = useRef(null)
  const [dragPreview, setDragPreviewState] = useState(null) // { id, dayIndex, originalDayIndex }
  const setDragPreview = (value) => {
    dragPreviewRef.current = value
    setDragPreviewState(value)
  }
  const [dayListDay, setDayListDay] = useState(null)

  const dayIndexFromPoint = (clientX, clientY) => {
    if (!gridRef.current) return null
    const rects = [...gridRef.current.children].map((cell) => cell.getBoundingClientRect())
    return cellIndexFromPoint(rects, clientX, clientY)
  }

  const dayDelta = dragPreview ? dragPreview.dayIndex - dragPreview.originalDayIndex : 0

  const displayEvents =
    dragPreview && dayDelta !== 0
      ? events.map((ev) =>
          ev.id === dragPreview.id
            ? { ...ev, start: addDays(ev.start, dayDelta), end: addDays(ev.end, dayDelta) }
            : ev,
        )
      : events

  // El arrastre se sigue en window y no solo con la captura del puntero en la reunión: al pasar a
  // otro día React la recoloca en otra casilla, el navegador suelta la captura y la reunión ya no
  // recibía el soltar; se quedaba arrastrando y seguía moviéndose al pasar el ratón por encima.
  const handlePointerDown = (e, ev, dayIndex) => {
    e.stopPropagation()
    if (!canStartDrag(e)) return
    dragDataRef.current?.stopListening?.() // otro dedo que empieza a arrastrar sustituye al anterior
    e.currentTarget.setPointerCapture(e.pointerId)
    draggedRef.current = false
    const drag = { event: ev, originalDayIndex: dayIndex }
    dragDataRef.current = drag
    drag.stopListening = trackDrag(e, {
      threshold: dragThresholdFor(e.pointerType),
      onEngage: () => {
        draggedRef.current = true
        hidePreview()
      },
      onMove: (me) => handlePointerMoveRef.current(me),
      onEnd: (result) => finishDragRef.current(result),
    })
  }

  useEffect(() => () => dragDataRef.current?.stopListening?.(), [])

  const handlePointerMove = (e) => {
    const drag = dragDataRef.current
    if (!drag) return

    const newIndex = dayIndexFromPoint(e.clientX, e.clientY)
    if (newIndex === null) return
    setDragPreview({ id: drag.event.id, dayIndex: newIndex, originalDayIndex: drag.originalDayIndex })
  }

  const finishDrag = ({ engaged, cancel }) => {
    const drag = dragDataRef.current
    if (!drag) return
    const preview = dragPreviewRef.current
    const finalDelta = preview ? preview.dayIndex - drag.originalDayIndex : 0
    dragDataRef.current = null
    setDragPreview(null)
    if (!engaged || cancel || finalDelta === 0) return
    onMoveEvent?.(drag.event, addDays(drag.event.start, finalDelta), addDays(drag.event.end, finalDelta))
  }

  // Los manejadores de window llaman siempre a la versión más reciente.
  const handlePointerMoveRef = useRef(handlePointerMove)
  const finishDragRef = useRef(finishDrag)
  useEffect(() => {
    handlePointerMoveRef.current = handlePointerMove
    finishDragRef.current = finishDrag
  })

  const handleEventClick = (e, ev) => {
    hidePreview()
    e.stopPropagation()
    if (draggedRef.current) {
      draggedRef.current = false
      return
    }
    onSelectEvent(ev)
  }

  const getDayEvents = (day) =>
    displayEvents.filter((ev) => isEventOnDay(ev, day)).sort((a, b) => a.start - b.start)

  const handleCellDoubleClick = (day) => {
    setDayListDay(null)
    onSelectDay?.(day)
  }

  return (
    <div className="month-view">
      <div className="month-weekdays">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="month-weekday">
            {label}
          </div>
        ))}
      </div>
      <div className="month-grid" ref={gridRef}>
        {days.map((day, dayIndex) => {
          const dayEvents = getDayEvents(day)
          const isToday = isSameDay(day, today)
          const inMonth = isSameMonth(day, currentDate)
          const hasEvents = dayEvents.length > 0
          // Vacaciones o festivo: con su texto en vez de un punto.
          const dayOff = dayEvents.find(isMarkedDayOff) || null
          const dotEvents = dayOff ? dayEvents.filter((ev) => ev !== dayOff) : dayEvents
          const visible = dotEvents.slice(0, MAX_VISIBLE_DOTS)
          const extra = dotEvents.length - visible.length

          return (
            <div
              key={day.toISOString()}
              className={`month-cell ${inMonth ? '' : 'outside'}`}
              onDoubleClick={() => handleCellDoubleClick(day)}
            >
              <button
                type="button"
                className={`month-cell-date ${isToday ? 'today' : ''} ${hasEvents ? 'clickable' : ''}`}
                onClick={() => hasEvents && setDayListDay(day)}
                aria-label={
                  hasEvents
                    ? `Ver ${dayEvents.length} reunión(es) del ${format(day, 'd MMMM', { locale: es })}`
                    : format(day, 'd MMMM', { locale: es })
                }
              >
                {format(day, 'd')}
              </button>
              <div className="month-cell-events">
                {dayOff && (
                  <button
                    type="button"
                    className="month-day-off"
                    title={eventTitle(dayOff)}
                    {...bindPreview(dayOff)}
                    onClick={(e) => handleEventClick(e, dayOff)}
                  >
                    <UnavailableIcon event={dayOff} size={10} />
                    <span>{kindLabel(unavailableKindOf(dayOff))}</span>
                  </button>
                )}
                {visible.length > 0 && (
                  <div className="month-day-dots">
                    {visible.map((ev) => (
                      <button
                        type="button"
                        key={ev.id}
                        className={`month-event-dot ${dragPreview?.id === ev.id ? 'dragging' : ''}`}
                        style={{ '--event-color': colorForEvent(ev), touchAction: 'none' }}
                        aria-label={`${ev.provisional ? 'Provisional: ' : ''}${ev.notAttending ? `${NOT_ATTENDING_LABEL}: ` : ''}${eventTitle(ev)}${!ev.allDay ? ' · ' + format(ev.start, 'HH:mm') : ''}${hasNotes(ev) ? ' · Con acta' : ''}`}
                        {...bindPreview(ev)}
                        onPointerDown={(e) => {
                          hidePreview()
                          handlePointerDown(e, ev, dayIndex)
                          pressPreview(e, ev)
                        }}
                        onClick={(e) => handleEventClick(e, ev)}
                      >
                        <span className={`month-event-dot-mark ${ev.isUnavailable ? 'unavailable' : ''} ${ev.provisional ? 'provisional' : ''} ${ev.notAttending ? 'organized' : ''}`} />
                        {hasNotes(ev) && <NotebookPen size={8} strokeWidth={2.5} className="month-event-dot-notes" aria-hidden="true" />}
                      </button>
                    ))}
                  </div>
                )}
                {extra > 0 && (
                  <button
                    type="button"
                    className="month-day-more"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDayListDay(day)
                    }}
                  >
                    +{extra}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <EventPreview preview={dragPreview ? null : preview} />
      <DayEventsModal
        day={dayListDay}
        events={dayListDay ? getDayEvents(dayListDay) : []}
        onClose={() => setDayListDay(null)}
        onSelectEvent={(ev) => {
          setDayListDay(null)
          onSelectEvent(ev)
        }}
      />
    </div>
  )
}

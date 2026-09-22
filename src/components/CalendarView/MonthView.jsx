import { useRef, useState } from 'react'
import { format, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { getMonthGridDays, isSameDay, isSameMonth } from '../../lib/dateHelpers'
import { isEventOnDay } from '../../lib/eventLayout'
import { colorForEvent } from '../../lib/eventStyle'
import { dragThresholdFor } from '../../lib/dragThreshold'
import { useMediaQuery } from '../../lib/useMediaQuery'
import DayEventsModal from '../DayEventsModal.jsx'
import './MonthView.css'

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export default function MonthView({ currentDate, events, onSelectEvent, onSelectDay, onMoveEvent }) {
  const isMobile = useMediaQuery('(max-width: 640px)')
  const MAX_VISIBLE_DOTS = isMobile ? 4 : 6
  const days = getMonthGridDays(currentDate)
  const today = new Date()
  const gridRef = useRef(null)
  const dragDataRef = useRef(null)
  const draggedRef = useRef(false)
  const [dragPreview, setDragPreview] = useState(null) // { id, dayIndex }
  const [dayListDay, setDayListDay] = useState(null)

  const dayIndexFromPoint = (clientX, clientY) => {
    if (!gridRef.current) return null
    const rect = gridRef.current.getBoundingClientRect()
    const rows = Math.ceil(days.length / 7)
    const colWidth = rect.width / 7
    const rowHeight = rect.height / rows
    const col = Math.min(6, Math.max(0, Math.floor((clientX - rect.left) / colWidth)))
    const row = Math.min(rows - 1, Math.max(0, Math.floor((clientY - rect.top) / rowHeight)))
    return row * 7 + col
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

  const handlePointerDown = (e, ev, dayIndex) => {
    if (ev.isRecurringInstance) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    draggedRef.current = false
    dragDataRef.current = {
      event: ev,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      engaged: false,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originalDayIndex: dayIndex,
    }
  }

  const handlePointerMove = (e) => {
    const drag = dragDataRef.current
    if (!drag || e.pointerId !== drag.pointerId) return

    if (!drag.engaged) {
      const dist = Math.hypot(e.clientX - drag.startClientX, e.clientY - drag.startClientY)
      if (dist < dragThresholdFor(drag.pointerType)) return
      drag.engaged = true
      draggedRef.current = true
    }

    const newIndex = dayIndexFromPoint(e.clientX, e.clientY)
    if (newIndex === null) return
    setDragPreview({ id: drag.event.id, dayIndex: newIndex, originalDayIndex: drag.originalDayIndex })
  }

  const finishDrag = (e) => {
    const drag = dragDataRef.current
    if (!drag || e.pointerId !== drag.pointerId) return
    const finalDelta = dragPreview ? dragPreview.dayIndex - drag.originalDayIndex : 0
    dragDataRef.current = null
    setDragPreview(null)
    if (finalDelta !== 0 && draggedRef.current) {
      onMoveEvent?.(drag.event, addDays(drag.event.start, finalDelta), addDays(drag.event.end, finalDelta))
    }
  }

  const handleEventClick = (e, ev) => {
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
          const visible = dayEvents.slice(0, MAX_VISIBLE_DOTS)
          const extra = dayEvents.length - visible.length

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
                {visible.length > 0 && (
                  <div className="month-day-dots">
                    {visible.map((ev) => (
                      <button
                        type="button"
                        key={ev.id}
                        className={`month-event-dot ${dragPreview?.id === ev.id ? 'dragging' : ''}`}
                        style={{ '--event-color': colorForEvent(ev), touchAction: 'none' }}
                        title={`${ev.title}${!ev.allDay ? ' · ' + format(ev.start, 'HH:mm') : ''}`}
                        aria-label={ev.title}
                        onPointerDown={(e) => handlePointerDown(e, ev, dayIndex)}
                        onPointerMove={handlePointerMove}
                        onPointerUp={finishDrag}
                        onPointerCancel={finishDrag}
                        onClick={(e) => handleEventClick(e, ev)}
                      >
                        <span className={`month-event-dot-mark ${ev.isUnavailable ? 'unavailable' : ''}`} />
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

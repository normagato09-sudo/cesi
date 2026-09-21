import { useRef, useState } from 'react'
import { format, addDays } from 'date-fns'
import { Ban } from 'lucide-react'
import { getMonthGridDays, isSameDay, isSameMonth } from '../../lib/dateHelpers'
import { isEventOnDay } from '../../lib/eventLayout'
import { colorForEvent } from '../../lib/eventStyle'
import './MonthView.css'

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MAX_VISIBLE = 3

export default function MonthView({ currentDate, events, onSelectEvent, onSelectDay, onMoveEvent }) {
  const days = getMonthGridDays(currentDate)
  const today = new Date()
  const gridRef = useRef(null)
  const dragDataRef = useRef(null)
  const draggedRef = useRef(false)
  const [dragPreview, setDragPreview] = useState(null) // { id, dayIndex }

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
    dragDataRef.current = { event: ev, pointerId: e.pointerId, originalDayIndex: dayIndex }
    setDragPreview({ id: ev.id, dayIndex, originalDayIndex: dayIndex })
  }

  const handlePointerMove = (e) => {
    const drag = dragDataRef.current
    if (!drag || e.pointerId !== drag.pointerId) return
    const newIndex = dayIndexFromPoint(e.clientX, e.clientY)
    if (newIndex === null) return
    if (newIndex !== drag.originalDayIndex) draggedRef.current = true
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

  const handleEventClick = (ev) => {
    if (draggedRef.current) {
      draggedRef.current = false
      return
    }
    onSelectEvent(ev)
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
          const dayEvents = displayEvents
            .filter((ev) => isEventOnDay(ev, day))
            .sort((a, b) => a.start - b.start)
          const isToday = isSameDay(day, today)
          const inMonth = isSameMonth(day, currentDate)
          const visible = dayEvents.slice(0, MAX_VISIBLE)
          const extra = dayEvents.length - visible.length

          return (
            <div
              key={day.toISOString()}
              className={`month-cell ${inMonth ? '' : 'outside'}`}
              onDoubleClick={() => onSelectDay?.(day)}
            >
              <div className={`month-cell-date ${isToday ? 'today' : ''}`}>
                {format(day, 'd')}
              </div>
              <div className="month-cell-events">
                {visible.map((ev) => (
                  <button
                    type="button"
                    key={ev.id}
                    className={`month-event ${ev.isUnavailable ? 'unavailable' : ''} ${dragPreview?.id === ev.id ? 'dragging' : ''}`}
                    style={{ '--event-color': colorForEvent(ev), touchAction: 'none' }}
                    onPointerDown={(e) => handlePointerDown(e, ev, dayIndex)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={finishDrag}
                    onPointerCancel={finishDrag}
                    onClick={() => handleEventClick(ev)}
                  >
                    {ev.isUnavailable && <Ban size={11} strokeWidth={2} className="month-event-icon" />}
                    {!ev.allDay && (
                      <span className="month-event-time">{format(ev.start, 'HH:mm')}</span>
                    )}
                    <span className="month-event-title">{ev.title}</span>
                  </button>
                ))}
                {extra > 0 && <div className="month-event-more">+{extra} más</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

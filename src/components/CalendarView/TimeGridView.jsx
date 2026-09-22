import { useEffect, useRef, useState } from 'react'
import { format, addDays, startOfDay } from 'date-fns'
import { Ban } from 'lucide-react'
import { isSameDay } from '../../lib/dateHelpers'
import { isEventOnDay, layoutEvents } from '../../lib/eventLayout'
import { colorForEvent } from '../../lib/eventStyle'
import { dragThresholdFor } from '../../lib/dragThreshold'
import { useMediaQuery } from '../../lib/useMediaQuery'
import './TimeGridView.css'

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const SNAP_MINUTES = 15
const GUTTER_WIDTH = 56

function minutesFromMidnight(date) {
  return date.getHours() * 60 + date.getMinutes()
}

function snap(minutes) {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES
}

export default function TimeGridView({ days, events, onSelectEvent, onSlotClick, onMoveEvent, onResizeEvent }) {
  const isMobile = useMediaQuery('(max-width: 640px)')
  const HOUR_HEIGHT = isMobile ? 64 : 56
  const scrollRef = useRef(null)
  const dragDataRef = useRef(null)
  const draggedRef = useRef(false)
  const [dragPreview, setDragPreview] = useState(null)
  const today = new Date()

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, 7 * HOUR_HEIGHT - 80)
    }
  }, [HOUR_HEIGHT])

  const displayEvents = dragPreview
    ? events.map((ev) => (ev.id === dragPreview.id ? { ...ev, start: dragPreview.start, end: dragPreview.end } : ev))
    : events

  const allDayEvents = displayEvents.filter(
    (ev) => ev.allDay && days.some((day) => isEventOnDay(ev, day)),
  )

  const dayIndexFromClientX = (clientX) => {
    if (!scrollRef.current || days.length <= 1) return null
    const rect = scrollRef.current.getBoundingClientRect()
    const colWidth = (rect.width - GUTTER_WIDTH) / days.length
    const rel = clientX - rect.left - GUTTER_WIDTH
    return Math.min(days.length - 1, Math.max(0, Math.floor(rel / colWidth)))
  }

  const handleMoveStart = (e, event, dayIndex) => {
    if (event.isRecurringInstance) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    draggedRef.current = false
    dragDataRef.current = {
      kind: 'move',
      event,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      engaged: false,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originalStart: event.start,
      originalDayIndex: dayIndex,
      duration: event.end - event.start,
    }
  }

  const handleResizeStart = (e, event) => {
    if (event.isRecurringInstance) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    draggedRef.current = false
    dragDataRef.current = {
      kind: 'resize',
      event,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      engaged: false,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originalStart: event.start,
      originalEnd: event.end,
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

    const deltaMinutes = snap(((e.clientY - drag.startClientY) / HOUR_HEIGHT) * 60)

    if (drag.kind === 'move') {
      let newStart = new Date(drag.originalStart.getTime() + deltaMinutes * 60000)
      const newDayIndex = dayIndexFromClientX(e.clientX)
      if (newDayIndex !== null && drag.originalDayIndex !== null && newDayIndex !== drag.originalDayIndex) {
        newStart = addDays(newStart, newDayIndex - drag.originalDayIndex)
      }
      const dayStart = startOfDay(newStart)
      const durationMin = drag.duration / 60000
      const minutesInto = Math.min(24 * 60 - durationMin, Math.max(0, (newStart - dayStart) / 60000))
      newStart = new Date(dayStart.getTime() + minutesInto * 60000)
      const newEnd = new Date(newStart.getTime() + drag.duration)
      setDragPreview({ id: drag.event.id, start: newStart, end: newEnd })
    } else {
      const dayStart = startOfDay(drag.originalEnd)
      const startMinutes = (drag.originalStart - dayStart) / 60000
      let endMinutes = (drag.originalEnd - dayStart) / 60000 + deltaMinutes
      endMinutes = Math.max(startMinutes + SNAP_MINUTES, Math.min(24 * 60, endMinutes))
      const newEnd = new Date(dayStart.getTime() + endMinutes * 60000)
      setDragPreview({ id: drag.event.id, start: drag.originalStart, end: newEnd })
    }
  }

  const finishDrag = (e) => {
    const drag = dragDataRef.current
    if (!drag || e.pointerId !== drag.pointerId) return
    const preview = dragPreview
    dragDataRef.current = null
    setDragPreview(null)
    if (!preview || !draggedRef.current) return
    if (drag.kind === 'move') onMoveEvent?.(drag.event, preview.start, preview.end)
    else onResizeEvent?.(drag.event, preview.start, preview.end)
  }

  const handleEventClick = (event) => {
    if (draggedRef.current) {
      draggedRef.current = false
      return
    }
    onSelectEvent(event)
  }

  return (
    <div className="time-grid-view" style={{ '--day-count': days.length }}>
      <div className="time-grid-header">
        <div className="time-grid-gutter" />
        {days.map((day) => (
          <div key={day.toISOString()} className="time-grid-day-header">
            <span className="time-grid-day-name">{format(day, 'EEE')}</span>
            <span className={`time-grid-day-number ${isSameDay(day, today) ? 'today' : ''}`}>
              {format(day, 'd')}
            </span>
          </div>
        ))}
      </div>

      {allDayEvents.length > 0 && (
        <div className="time-grid-allday">
          <div className="time-grid-gutter">Todo el día</div>
          {days.map((day) => (
            <div key={day.toISOString()} className="time-grid-allday-cell">
              {allDayEvents
                .filter((ev) => isEventOnDay(ev, day))
                .map((ev) => (
                  <button
                    type="button"
                    key={ev.id}
                    className={`time-grid-allday-event ${ev.isUnavailable ? 'unavailable' : ''}`}
                    style={{ '--event-color': colorForEvent(ev) }}
                    onClick={() => onSelectEvent(ev)}
                  >
                    {ev.isUnavailable && <Ban size={11} strokeWidth={2} />}
                    {ev.title}
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}

      <div className="time-grid-body" ref={scrollRef}>
        <div className="time-grid-gutter-col">
          {HOURS.map((hour) => (
            <div key={hour} className="time-grid-hour-label">
              {hour === 0 ? '' : `${String(hour).padStart(2, '0')}:00`}
            </div>
          ))}
        </div>

        {days.map((day, dayIndex) => {
          const dayEvents = displayEvents.filter((ev) => !ev.allDay && isEventOnDay(ev, day))
          const laidOut = layoutEvents(dayEvents)
          const isToday = isSameDay(day, today)
          const nowTop = minutesFromMidnight(today) * (HOUR_HEIGHT / 60)

          return (
            <div key={day.toISOString()} className="time-grid-day-col">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="time-grid-hour-cell"
                  style={{ height: HOUR_HEIGHT }}
                  onClick={() => onSlotClick?.(day, hour)}
                />
              ))}

              {isToday && (
                <div className="time-grid-now-line" style={{ top: nowTop }}>
                  <span className="time-grid-now-dot" />
                </div>
              )}

              {laidOut.map(({ event, col, colCount }) => {
                const startMin = Math.max(0, minutesFromMidnight(event.start))
                const endMin = isSameDay(event.start, event.end)
                  ? minutesFromMidnight(event.end)
                  : 24 * 60
                const top = startMin * (HOUR_HEIGHT / 60)
                const height = Math.max(22, (endMin - startMin) * (HOUR_HEIGHT / 60))
                const width = 100 / colCount
                const left = width * col
                const isDragging = dragPreview?.id === event.id

                return (
                  <button
                    type="button"
                    key={event.id}
                    className={`time-grid-event ${event.isUnavailable ? 'unavailable' : ''} ${isDragging ? 'dragging' : ''}`}
                    style={{
                      '--event-color': colorForEvent(event),
                      top,
                      height,
                      width: `calc(${width}% - 4px)`,
                      left: `calc(${left}% + 2px)`,
                      touchAction: 'none',
                    }}
                    onPointerDown={(e) => handleMoveStart(e, event, dayIndex)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={finishDrag}
                    onPointerCancel={finishDrag}
                    onClick={() => handleEventClick(event)}
                  >
                    <span className="time-grid-event-title">
                      {event.isUnavailable && <Ban size={11} strokeWidth={2} />} {event.title}
                    </span>
                    <span className="time-grid-event-time">{format(event.start, 'HH:mm')}</span>
                    {!event.isRecurringInstance && (
                      <div
                        className="time-grid-event-resize-handle"
                        style={{ touchAction: 'none' }}
                        onPointerDown={(e) => handleResizeStart(e, event)}
                        onPointerMove={handlePointerMove}
                        onPointerUp={finishDrag}
                        onPointerCancel={finishDrag}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

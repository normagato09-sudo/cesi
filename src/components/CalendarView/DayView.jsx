import TimeGridView from './TimeGridView.jsx'

export default function DayView({ currentDate, events, workingHours, onSelectEvent, onSlotClick, onMoveEvent, onResizeEvent }) {
  return (
    <TimeGridView
      days={[currentDate]}
      events={events}
      workingHours={workingHours}
      onSelectEvent={onSelectEvent}
      onSlotClick={onSlotClick}
      onMoveEvent={onMoveEvent}
      onResizeEvent={onResizeEvent}
    />
  )
}

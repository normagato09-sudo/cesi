import TimeGridView from './TimeGridView.jsx'

export default function DayView({ currentDate, events, onSelectEvent, onSlotClick, onMoveEvent, onResizeEvent }) {
  return (
    <TimeGridView
      days={[currentDate]}
      events={events}
      onSelectEvent={onSelectEvent}
      onSlotClick={onSlotClick}
      onMoveEvent={onMoveEvent}
      onResizeEvent={onResizeEvent}
    />
  )
}

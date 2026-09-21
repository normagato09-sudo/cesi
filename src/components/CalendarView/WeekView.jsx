import { getWeekDays } from '../../lib/dateHelpers'
import TimeGridView from './TimeGridView.jsx'

export default function WeekView({ currentDate, events, onSelectEvent, onSlotClick, onMoveEvent, onResizeEvent }) {
  const days = getWeekDays(currentDate)
  return (
    <TimeGridView
      days={days}
      events={events}
      onSelectEvent={onSelectEvent}
      onSlotClick={onSlotClick}
      onMoveEvent={onMoveEvent}
      onResizeEvent={onResizeEvent}
    />
  )
}

import { format, isSameDay, differenceInMinutes } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarCheck } from 'lucide-react'
import { formatDuration, WEEKDAY_SHORT_LABELS } from '../lib/summary'
import './SummaryPanel.css'

function countdownLabel(start, now) {
  const diffMin = differenceInMinutes(start, now)
  if (diffMin <= 0) return 'Ahora'
  if (diffMin < 60) return `En ${diffMin} min`
  const h = Math.floor(diffMin / 60)
  const m = diffMin % 60
  return `En ${h} h${m ? ` ${m} min` : ''}`
}

export default function SummaryPanel({ summary, now }) {
  const { today, week, nextMeeting } = summary

  return (
    <div className="summary-panel">
      <div className="summary-card next-meeting-card">
        <span className="summary-card-title">
          <CalendarCheck size={13} strokeWidth={2} />
          Próxima reunión
        </span>
        {nextMeeting ? (
          <>
            <p className="next-meeting-title">{nextMeeting.title}</p>
            <p className="next-meeting-time">
              {isSameDay(nextMeeting.start, now)
                ? 'Hoy'
                : format(nextMeeting.start, "EEEE d 'de' MMM", { locale: es })}{' '}
              · {format(nextMeeting.start, 'HH:mm')}–{format(nextMeeting.end, 'HH:mm')}
            </p>
            <p className="next-meeting-countdown">{countdownLabel(nextMeeting.start, now)}</p>
          </>
        ) : (
          <p className="summary-empty">No tienes próximas reuniones.</p>
        )}
      </div>

      <div className="summary-card">
        <span className="summary-card-title">Hoy</span>
        <ul className="summary-stats">
          <li>
            <strong>{today.meetings}</strong> reunión{today.meetings === 1 ? '' : 'es'}
          </li>
          <li>{formatDuration(today.occupiedMs)} ocupadas</li>
          <li>{formatDuration(today.freeMs)} libres</li>
        </ul>
      </div>

      <div className="summary-card">
        <span className="summary-card-title">Esta semana</span>
        <ul className="summary-stats">
          <li>
            <strong>{week.meetings}</strong> reuniones
          </li>
          <li>{formatDuration(week.occupiedMs)} ocupadas</li>
          <li>
            Día más ocupado:{' '}
            {week.busiestDayIndex !== null ? WEEKDAY_SHORT_LABELS[week.busiestDayIndex] : '—'}
          </li>
        </ul>
      </div>
    </div>
  )
}

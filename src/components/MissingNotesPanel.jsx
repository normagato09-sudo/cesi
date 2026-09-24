import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { NotebookPen } from 'lucide-react'
import { colorForEvent } from '../lib/eventStyle'
import './MissingNotesPanel.css'

const MAX_ITEMS = 6

// "Sin notas" en la barra lateral: reuniones de los últimos 7 días ya terminadas y sin notas.
export default function MissingNotesPanel({ meetings, onOpen }) {
  if (meetings.length === 0) return null
  const visible = meetings.slice(0, MAX_ITEMS)
  const extra = meetings.length - visible.length

  return (
    <section className="missing-notes-panel" aria-label="Reuniones sin notas">
      <h2 className="missing-notes-title">
        <NotebookPen size={12} strokeWidth={2} />
        Sin notas
        <span className="missing-notes-count">{meetings.length}</span>
      </h2>
      <ul>
        {visible.map((ev) => (
          <li key={ev.id}>
            <button
              type="button"
              className="missing-notes-item"
              style={{ '--event-color': colorForEvent(ev) }}
              onClick={() => onOpen(ev)}
              title="Escribir las notas"
            >
              <span className="missing-notes-name">{ev.title}</span>
              <span className="missing-notes-date">{format(ev.start, "EEE d · HH:mm", { locale: es })}</span>
            </button>
          </li>
        ))}
      </ul>
      {extra > 0 && <p className="missing-notes-more">y {extra} más en el calendario</p>}
    </section>
  )
}

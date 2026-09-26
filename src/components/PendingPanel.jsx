import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Check, ListTodo, Search } from 'lucide-react'
import { colorForEvent } from '../lib/eventStyle'
import './MissingNotesPanel.css'
import './PendingPanel.css'

const MAX_ITEMS = 6

// "Pendientes" en la barra lateral: reuniones de los próximos 60 días con participantes que no
// pueden según su disponibilidad (p. ej. porque ha cambiado su disponibilidad).
export default function PendingPanel({ items, onOpen, onReschedule, onKeep }) {
  if (items.length === 0) return null
  const visible = items.slice(0, MAX_ITEMS)
  const extra = items.length - visible.length

  return (
    <section className="missing-notes-panel pending-panel" aria-label="Pendientes">
      <h2 className="missing-notes-title">
        <ListTodo size={12} strokeWidth={2} />
        Pendientes
        <span className="missing-notes-count pending-count">{items.length}</span>
      </h2>
      <p className="pending-subtitle">Reuniones con participantes que no pueden</p>
      <ul>
        {visible.map((item) => {
          const { occurrence: ev } = item
          return (
            <li key={ev.id} className="pending-item" style={{ '--event-color': colorForEvent(ev) }}>
              <button type="button" className="pending-open" onClick={() => onOpen(item)} title="Abrir la reunión">
                <span className="missing-notes-name">{ev.title}</span>
                <span className="missing-notes-date">
                  {format(ev.start, 'EEE d · HH:mm', { locale: es })}
                  {item.count > 1 && ` · y ${item.count - 1} día${item.count === 2 ? '' : 's'} más`}
                </span>
                <span className="pending-reason">{item.message}</span>
              </button>
              <span className="pending-actions">
                <button type="button" className="pending-action primary" onClick={() => onReschedule(item)}>
                  <Search size={12} strokeWidth={2} />
                  Buscar otro hueco
                </button>
                <button type="button" className="pending-action" onClick={() => onKeep(item)} title="No volver a avisar de esta reunión por estas personas">
                  <Check size={12} strokeWidth={2} />
                  Mantener
                </button>
              </span>
            </li>
          )
        })}
      </ul>
      {extra > 0 && <p className="missing-notes-more">y {extra} más</p>}
    </section>
  )
}

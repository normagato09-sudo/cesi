import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Lock, MessageSquare, Plus, Search } from 'lucide-react'
import BoardItemModal from './BoardItemModal.jsx'
import { keyOf } from '../../lib/sharedCalendar'
import {
  boardColumns,
  boardOf,
  filterItems,
  isLate,
  listBoardItems,
  listBoardPeople,
  monthWeeks,
  moveBoardItem,
  optionLabel,
  reviewState,
  statusLabel,
} from '../../lib/boards'
import '../shared/SharedCalendar.css'
import '../team/TeamWork.css'
import './Boards.css'

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function dayLabel(key) {
  const [y, m, d] = key.split('-')
  return `${Number(d)}/${Number(m)}/${y}`
}

function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-01`
}

// Una tarjeta: título, sus campos con opciones, responsable y fecha (en rojo si va tarde; en
// Legal, naranja si hay que revisarlo pronto). Con canEdit, se mueve de columna con su selector.
function ItemCard({ cfg, item, today, canEdit, busy, onOpen, onMove }) {
  const late = isLate(cfg, item, today)
  const review = reviewState(cfg, item, today)
  return (
    <div className={`bd-card${late ? ' late' : review === 'soon' ? ' soon' : ''}`}>
      <button type="button" className="bd-card-main" onClick={() => onOpen(item)}>
        <strong>{item.title}</strong>
        <span className="bd-card-meta">
          {cfg.fields
            .filter((f) => f.options && item.fields?.[f.id])
            .map((f) => (
              <span key={f.id}>{optionLabel(f.options, item.fields[f.id])}</span>
            ))}
          {cfg.priority && item.priority && <span className={`bd-priority ${item.priority}`}>{optionLabel(cfg.priority.options, item.priority)}</span>}
          {item.owner_name && <span>{item.owner_name}</span>}
          {item.due_date && (
            <span className={late ? 'bd-late' : review === 'soon' ? 'bd-soon' : undefined}>
              {cfg.date.review ? 'Revisión: ' : ''}
              {dayLabel(item.due_date)}
              {item.due_time ? ` · ${item.due_time}` : ''}
            </span>
          )}
          {item.comments_count > 0 && (
            <span className="bd-count" aria-label={`${item.comments_count} comentarios`}>
              <MessageSquare size={12} strokeWidth={1.75} />
              {item.comments_count}
            </span>
          )}
        </span>
      </button>
      {canEdit && (
        <select className="bd-move" value={item.status} aria-label={`Mover «${item.title}»`} disabled={busy} onChange={(e) => onMove(item, e.target.value)}>
          {cfg.statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

/**
 * El tablero de un área: columnas por estado (cada tarjeta se mueve con su selector), lista con
 * buscador y filtros (estado, responsable y campos propios) y, en Media, el calendario del mes.
 * canEdit: las personas del área y la ceo; canComment: también Directivo. asId + readOnly: «Ver
 * como» de la ceo. meId: quien mira (para proponerle como responsable).
 */
export default function BoardView({ client, area, meId, zone, asId = null, readOnly = false, canEdit, canComment, heading = null }) {
  const cfg = boardOf(area)
  const today = keyOf(new Date(), zone)
  const [items, setItems] = useState(null)
  const [people, setPeople] = useState([])
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)
  const [mode, setMode] = useState('board')
  const [filters, setFilters] = useState({ query: '', status: '', owner: '', fields: {} })
  const [month, setMonth] = useState(`${today.slice(0, 7)}-01`)
  const [open, setOpen] = useState(null) // { item } (null: nuevo)
  const [busyId, setBusyId] = useState(null)
  const edit = canEdit && !readOnly
  const comment = canComment && !readOnly

  useEffect(() => {
    if (!client || !cfg) return
    let active = true
    Promise.all([listBoardItems(client, area, asId), listBoardPeople(client, area).catch(() => [])]).then(
      ([rows, ppl]) => {
        if (!active) return
        setItems(rows || [])
        setPeople(ppl || [])
        setError(null)
      },
      (err) => active && setError(err.message),
    )
    return () => {
      active = false
    }
  }, [client, area, asId, cfg, reload])

  const refresh = () => setReload((n) => n + 1)
  const shown = useMemo(() => filterItems(items || [], filters), [items, filters])
  const columns = useMemo(() => (cfg ? boardColumns(cfg, shown) : []), [cfg, shown])
  const setFilter = (patch) => setFilters((f) => ({ ...f, ...patch }))

  if (!cfg) return <p className="sc-message">Esta área no tiene tablero.</p>

  const move = async (item, status) => {
    setBusyId(item.id)
    try {
      await moveBoardItem(client, item.id, status)
      refresh()
    } catch (err) {
      window.alert(err.message)
    }
    setBusyId(null)
  }

  const card = (item) => <ItemCard key={item.id} cfg={cfg} item={item} today={today} canEdit={edit} busy={busyId === item.id} onOpen={(i) => setOpen({ item: i })} onMove={move} />
  const modes = [
    { id: 'board', label: 'Tablero' },
    { id: 'list', label: 'Lista' },
    ...(cfg.calendar ? [{ id: 'calendar', label: 'Calendario' }] : []),
  ]
  const byDay = new Map()
  for (const i of shown) if (i.due_date) byDay.set(i.due_date, [...(byDay.get(i.due_date) || []), i])

  return (
    <div className="sc-root">
      <div className="sc-head">
        <div>
          <h1>{heading || cfg.title}</h1>
          {cfg.sensitive && (
            <p className="sc-zone bd-sensitive">
              <Lock size={13} strokeWidth={1.75} /> Información sensible: solo el área, Directivo y la dirección.
            </p>
          )}
        </div>
        <button type="button" className="sc-btn-primary" disabled={!edit || !client} onClick={() => setOpen({ item: null })}>
          <Plus size={16} strokeWidth={2} />
          {cfg.newLabel}
        </button>
      </div>

      <div className="bd-toolbar">
        <div className="tw-filters" role="group" aria-label="Cómo verlo">
          {modes.map((m) => (
            <button key={m.id} type="button" className={`tw-filter${mode === m.id ? ' on' : ''}`} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <label className="bd-search">
          <Search size={14} strokeWidth={1.75} />
          <input type="search" value={filters.query} onChange={(e) => setFilter({ query: e.target.value })} placeholder="Buscar…" aria-label="Buscar" />
        </label>
      </div>

      {mode !== 'board' && (
        <div className="bd-filters">
          <select value={filters.status} onChange={(e) => setFilter({ status: e.target.value })} aria-label="Estado">
            <option value="">Todos los estados</option>
            {cfg.statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <select value={filters.owner} onChange={(e) => setFilter({ owner: e.target.value })} aria-label="Responsable">
            <option value="">Todos los responsables</option>
            <option value="none">Sin responsable</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {cfg.fields
            .filter((f) => f.options)
            .map((f) => (
              <select key={f.id} value={filters.fields[f.id] || ''} onChange={(e) => setFilter({ fields: { ...filters.fields, [f.id]: e.target.value } })} aria-label={f.label}>
                <option value="">{f.label}: todos</option>
                {f.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            ))}
        </div>
      )}

      {error ? (
        <p className="sc-message error">{error}</p>
      ) : !client ? (
        <p className="sc-message">No hay nada aquí.</p>
      ) : !items ? (
        <p className="sc-message">Cargando…</p>
      ) : mode === 'board' ? (
        <div className="bd-board" style={{ '--bd-cols': cfg.statuses.length }}>
          {columns.map((col) => (
            <section key={col.id} className="bd-column" aria-label={col.label}>
              <h2>
                <span>{col.label}</span>
                <span>{col.items.length}</span>
              </h2>
              {col.items.map(card)}
            </section>
          ))}
        </div>
      ) : mode === 'list' ? (
        shown.length === 0 ? (
          <p className="sc-message">Nada con esos filtros.</p>
        ) : (
          <ul className="bd-list">
            {shown.map((i) => (
              <li key={i.id}>
                {card(i)}
                <span className="bd-list-status">{statusLabel(cfg, i.status)}</span>
              </li>
            ))}
          </ul>
        )
      ) : (
        <section className="bd-calendar" aria-label="Calendario del mes">
          <div className="bd-calendar-head">
            <button type="button" className="sc-btn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mes anterior">
              <ChevronLeft size={16} />
            </button>
            <h2>
              {MONTHS[Number(month.slice(5, 7)) - 1]} de {month.slice(0, 4)}
            </h2>
            <button type="button" className="sc-btn" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Mes siguiente">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="bd-calendar-grid">
            {['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map((d) => (
              <span key={d} className="bd-calendar-dow">
                {d}
              </span>
            ))}
            {monthWeeks(month)
              .flat()
              .map((day) => (
                <div key={day} className={`bd-day${day.slice(0, 7) !== month.slice(0, 7) ? ' other' : ''}${day === today ? ' today' : ''}`}>
                  <span className="bd-day-num">{Number(day.slice(8))}</span>
                  {(byDay.get(day) || []).map((i) => (
                    <button key={i.id} type="button" className={`bd-day-item ${i.status}`} onClick={() => setOpen({ item: i })} title={i.title}>
                      {i.due_time ? `${i.due_time} ` : ''}
                      {i.title}
                    </button>
                  ))}
                </div>
              ))}
          </div>
        </section>
      )}

      {open && (
        <BoardItemModal
          client={client}
          cfg={cfg}
          item={open.item}
          people={people}
          meId={meId}
          canEdit={edit}
          canComment={comment}
          asId={asId}
          today={today}
          onClose={() => setOpen(null)}
          onChanged={refresh}
          onSaved={() => {
            setOpen(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

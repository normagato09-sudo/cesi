import { useEffect, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Check, ChevronDown, ChevronUp, History, ListChecks, NotebookPen, Plus, X } from 'lucide-react'
import { moveItem, newAgendaItem, newDecision, pastSessions, sessionOf } from '../lib/meetingSession'
import { FLUSH_EVENT } from '../lib/appUpdates'
import './MeetingSession.css'

const SAVE_DELAY_MS = 600
const HISTORY_PAGE = 5

// Ajusta la altura de un textarea a su contenido (los puntos largos se ven enteros).
function fitHeight(el) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

// Lista editable: añadir, editar, reordenar con subir/bajar, quitar y (en la agenda) tachar.
function ItemList({ items, onChange, checkable = false, itemLabel, addPlaceholder, emptyText }) {
  const [draft, setDraft] = useState('')

  const setItem = (index, changes) => onChange(items.map((it, i) => (i === index ? { ...it, ...changes } : it)))
  const remove = (index) => onChange(items.filter((_, i) => i !== index))

  const add = () => {
    const text = draft.trim()
    if (!text) return
    onChange([...items, checkable ? newAgendaItem(text) : newDecision(text)])
    setDraft('')
  }

  return (
    <div className="session-list">
      {items.length === 0 && <p className="session-empty">{emptyText}</p>}
      {items.length > 0 && (
        <ol className="session-items">
          {items.map((item, index) => (
            <li key={item.id} className={`session-item${item.done ? ' done' : ''}`}>
              {checkable && (
                <label className="session-check" title={item.done ? 'Marcar como pendiente' : 'Tachar'}>
                  <input
                    type="checkbox"
                    checked={!!item.done}
                    onChange={(e) => setItem(index, { done: e.target.checked })}
                    aria-label={`Tachar: ${item.text}`}
                  />
                  <span className="session-check-box" aria-hidden="true">
                    {item.done && <Check size={14} strokeWidth={2.5} />}
                  </span>
                </label>
              )}
              <textarea
                ref={fitHeight}
                className="session-item-text"
                rows={1}
                value={item.text}
                onChange={(e) => {
                  fitHeight(e.target)
                  setItem(index, { text: e.target.value.replace(/\n/g, ' ') })
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    e.currentTarget.blur()
                  }
                }}
                onBlur={() => {
                  if (!item.text.trim()) remove(index)
                }}
                aria-label={`${itemLabel} ${index + 1}`}
              />
              <div className="session-item-actions">
                <button
                  type="button"
                  onClick={() => onChange(moveItem(items, index, -1))}
                  disabled={index === 0}
                  aria-label={`Subir: ${item.text}`}
                  title="Subir"
                >
                  <ChevronUp size={18} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={() => onChange(moveItem(items, index, 1))}
                  disabled={index === items.length - 1}
                  aria-label={`Bajar: ${item.text}`}
                  title="Bajar"
                >
                  <ChevronDown size={18} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => remove(index)}
                  aria-label={`Quitar: ${item.text}`}
                  title="Quitar"
                >
                  <X size={17} strokeWidth={2} />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="session-add">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder={addPlaceholder}
          aria-label={addPlaceholder}
          data-unsaved={draft.trim() ? 'true' : undefined}
        />
        <button type="button" onClick={add} disabled={!draft.trim()}>
          <Plus size={16} strokeWidth={2} />
          Añadir
        </button>
      </div>
    </div>
  )
}

// Agenda, notas y decisiones de las sesiones anteriores de una reunión que se repite.
function SessionHistory({ event }) {
  const sessions = pastSessions(event)
  const [shown, setShown] = useState(HISTORY_PAGE)
  if (sessions.length === 0) return null
  return (
    <details className="session-history">
      <summary>
        <History size={15} strokeWidth={1.75} />
        Sesiones anteriores ({sessions.length})
      </summary>
      <ul className="session-history-list">
        {sessions.slice(0, shown).map((s) => (
          <li key={s.key} className="session-history-item">
            <h4>{format(parseISO(s.key), "EEEE d 'de' MMMM yyyy", { locale: es })}</h4>
            {s.agenda.length > 0 && (
              <div>
                <span className="session-history-label">Agenda</span>
                <ul>
                  {s.agenda.map((it) => (
                    <li key={it.id} className={it.done ? 'done' : ''}>
                      {it.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {s.notes.trim() && (
              <div>
                <span className="session-history-label">Notas</span>
                <p>{s.notes}</p>
              </div>
            )}
            {s.decisions.length > 0 && (
              <div>
                <span className="session-history-label">Decisiones</span>
                <ul>
                  {s.decisions.map((it) => (
                    <li key={it.id}>{it.text}</li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>
      {sessions.length > shown && (
        <button type="button" className="session-history-more" onClick={() => setShown((n) => n + HISTORY_PAGE)}>
          Ver más
        </button>
      )}
    </details>
  )
}

// Agenda y acta (notas y decisiones) de una reunión o de una sesión de una reunión que se repite,
// con guardado automático. onSave recibe solo lo que ha cambiado ({ notes, agenda, decisions }).
export default function MeetingSession({ event, now, focusNotes = false, onSave }) {
  const [session, setSession] = useState(() => sessionOf(event))
  const finished = new Date(event.end) <= now
  const [tab, setTab] = useState(focusNotes || finished ? 'minutes' : 'agenda')
  const [status, setStatus] = useState('idle') // 'idle' | 'pending' | 'saved'
  const sectionRef = useRef(null)
  const notesRef = useRef(null)
  const timerRef = useRef(null)
  const pendingRef = useRef(null)
  const onSaveRef = useRef(onSave)

  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  // Si se cierra la reunión antes de que pase el retardo (o se actualiza la app), se guarda lo
  // que quede pendiente.
  useEffect(() => {
    const flush = () => {
      clearTimeout(timerRef.current)
      const changes = pendingRef.current
      pendingRef.current = null
      if (changes) onSaveRef.current(changes)
    }
    window.addEventListener(FLUSH_EVENT, flush)
    return () => {
      window.removeEventListener(FLUSH_EVENT, flush)
      flush()
    }
  }, [])

  useEffect(() => {
    if (!focusNotes) return
    sectionRef.current?.scrollIntoView({ block: 'center' })
    notesRef.current?.focus({ preventScroll: true })
  }, [focusNotes])

  const update = (field, value) => {
    setSession((s) => ({ ...s, [field]: value }))
    setStatus('pending')
    pendingRef.current = { ...(pendingRef.current || {}), [field]: value }
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const changes = pendingRef.current
      pendingRef.current = null
      if (changes) onSaveRef.current(changes)
      setStatus('saved')
    }, SAVE_DELAY_MS)
  }

  const minutesEmpty = !session.notes.trim() && session.decisions.length === 0
  const highlight = finished && minutesEmpty && tab === 'minutes'
  const doneCount = session.agenda.filter((it) => it.done).length

  return (
    <section ref={sectionRef} className={`session${highlight ? ' highlight' : ''}`} aria-label="Agenda y acta">
      <div className="session-head">
        <div className="session-tabs" role="tablist" aria-label="Agenda y acta">
          <button
            type="button"
            role="tab"
            id="session-tab-agenda"
            aria-selected={tab === 'agenda'}
            aria-controls="session-panel"
            className={tab === 'agenda' ? 'active' : ''}
            onClick={() => setTab('agenda')}
          >
            <ListChecks size={15} strokeWidth={1.75} />
            Agenda
            {session.agenda.length > 0 && (
              <span className="session-tab-count">
                {doneCount}/{session.agenda.length}
              </span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            id="session-tab-minutes"
            aria-selected={tab === 'minutes'}
            aria-controls="session-panel"
            className={tab === 'minutes' ? 'active' : ''}
            onClick={() => setTab('minutes')}
          >
            <NotebookPen size={15} strokeWidth={1.75} />
            Acta
          </button>
        </div>
        <span className="session-status" aria-live="polite">
          {status === 'pending' && 'Guardando…'}
          {status === 'saved' && (
            <>
              <Check size={13} strokeWidth={2} />
              Guardado
            </>
          )}
        </span>
      </div>

      <div id="session-panel" role="tabpanel" aria-labelledby={`session-tab-${tab}`} className="session-panel">
        {event.recurrence && <p className="session-scope">Solo de la sesión de este día.</p>}
        {tab === 'agenda' ? (
          <ItemList
            items={session.agenda}
            onChange={(list) => update('agenda', list)}
            checkable
            itemLabel="Punto"
            addPlaceholder="Añadir un punto a tratar…"
            emptyText="Todavía no hay puntos a tratar."
          />
        ) : (
          <>
            {highlight && <p className="session-prompt">¿Qué se habló en esta reunión?</p>}
            <label className="session-subtitle" htmlFor="session-notes">
              Notas
            </label>
            <textarea
              id="session-notes"
              ref={notesRef}
              className="session-notes"
              value={session.notes}
              onChange={(e) => update('notes', e.target.value)}
              rows={4}
              placeholder={event.recurrence ? 'Notas de este día…' : 'Lo que se habló, próximos pasos, ideas…'}
            />
            <span className="session-subtitle">Decisiones</span>
            <ItemList
              items={session.decisions}
              onChange={(list) => update('decisions', list)}
              itemLabel="Decisión"
              addPlaceholder="Añadir una decisión…"
              emptyText="Sin decisiones apuntadas."
            />
          </>
        )}
      </div>

      {event.recurrence && <SessionHistory event={event} />}
    </section>
  )
}

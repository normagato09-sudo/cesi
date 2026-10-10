import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  CircleStop,
  History,
  ListChecks,
  ListTodo,
  NotebookPen,
  Play,
  Plus,
  Timer,
  X,
} from 'lucide-react'
import {
  formatElapsed,
  moveItem,
  newAgendaItem,
  newDecision,
  pastSessions,
  sameText,
  sessionKeyOf,
  sessionOf,
} from '../lib/meetingSession'
import { FLUSH_EVENT } from '../lib/appUpdates'
import { sourceOf, taskOfDecision } from '../lib/tasks'
import TaskItem from './TaskItem.jsx'
import NotesEditor from './NotesEditor.jsx'
import NotesText from './NotesText.jsx'
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
// `renderExtra(item)`: algo más debajo de cada elemento (en las decisiones, su tarea).
function ItemList({ items, onChange, checkable = false, itemLabel, addPlaceholder, emptyText, renderExtra }) {
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
              <div className="session-item-row">
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
              </div>
              {renderExtra && item.text.trim() && renderExtra(item)}
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
                <NotesText text={s.notes} />
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

// Cronómetro del modo reunión: cuenta desde que se pulsa "Empezar reunión". Se recuerda en este
// dispositivo (si se cierra y se vuelve a abrir, sigue contando) hasta que se pulsa "Terminar".
const CLOCK_MAX_MS = 12 * 3600 * 1000

function clockKey(event) {
  return `cesi.meetingClock.${event.seriesId || event.id}.${sessionKeyOf(event)}`
}

function readClock(key) {
  try {
    const value = Number(localStorage.getItem(key))
    return value && Date.now() - value < CLOCK_MAX_MS ? value : null
  } catch {
    return null
  }
}

function writeClock(key, value) {
  try {
    if (value) localStorage.setItem(key, String(value))
    else localStorage.removeItem(key)
  } catch {
    // Sin almacenamiento: el cronómetro dura mientras esté abierta la reunión.
  }
}

function Elapsed({ since }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return <>{formatElapsed(now - since)}</>
}

function SaveStatus({ status }) {
  return (
    <span className="session-status" aria-live="polite">
      {status === 'pending' && 'Guardando…'}
      {status === 'saved' && (
        <>
          <Check size={13} strokeWidth={2} />
          Guardado
        </>
      )}
    </span>
  )
}

// Acta a pantalla completa mientras dura la reunión: agenda a un lado y notas al otro (en el
// móvil, con pestañas), cronómetro y "Terminar".
function MeetingLive({ event, clockStart, status, agenda, minutes, agendaCount, onEnd }) {
  const [tab, setTab] = useState('minutes')

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const start = new Date(event.start)
  const end = new Date(event.end)

  return createPortal(
    <div className="meeting-live" role="dialog" aria-modal="true" aria-labelledby="meeting-live-title">
      <header className="meeting-live-head">
        <div className="meeting-live-heading">
          <span className="meeting-live-badge">
            <span className="meeting-live-dot" aria-hidden="true" />
            En curso
          </span>
          <h2 id="meeting-live-title">{event.title || 'Reunión'}</h2>
          <p>
            {format(start, "EEEE d 'de' MMMM", { locale: es })} · {format(start, 'HH:mm')} – {format(end, 'HH:mm')}
          </p>
        </div>
        <div className="meeting-live-controls">
          <SaveStatus status={status} />
          <span className="meeting-live-clock" role="timer" aria-label="Tiempo de reunión">
            <Timer size={17} strokeWidth={1.9} aria-hidden="true" />
            <Elapsed since={clockStart} />
          </span>
          <button type="button" className="meeting-live-end" onClick={onEnd}>
            <CircleStop size={17} strokeWidth={1.9} />
            Terminar
          </button>
        </div>
      </header>

      <div className="meeting-live-tabs session-tabs" role="tablist" aria-label="Agenda y acta">
        <button type="button" role="tab" aria-selected={tab === 'agenda'} className={tab === 'agenda' ? 'active' : ''} onClick={() => setTab('agenda')}>
          <ListChecks size={16} strokeWidth={1.75} />
          Agenda
          {agendaCount && <span className="session-tab-count">{agendaCount}</span>}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'minutes'} className={tab === 'minutes' ? 'active' : ''} onClick={() => setTab('minutes')}>
          <NotebookPen size={16} strokeWidth={1.75} />
          Acta
        </button>
      </div>

      <div className="meeting-live-body" data-tab={tab}>
        <section className="meeting-live-pane meeting-live-agenda" aria-labelledby="meeting-live-agenda-title">
          <h3 id="meeting-live-agenda-title">
            Agenda
            {agendaCount && <span className="session-tab-count">{agendaCount}</span>}
          </h3>
          {agenda}
        </section>
        <section className="meeting-live-pane meeting-live-minutes" aria-label="Acta">
          {minutes}
        </section>
      </div>
    </div>,
    document.body,
  )
}

// Agenda y acta (notas, decisiones y tareas) de una reunión o de una sesión de una reunión que se
// repite, con guardado automático. onSave recibe solo lo que ha cambiado ({ notes, agenda, decisions }).
// Las tareas se guardan aparte (sección Tareas): `tasks` son todas; aquí se ven las de esta sesión.
// "Empezar reunión" abre el modo reunión (MeetingLive) con la misma agenda y la misma acta.
export default function MeetingSession({
  event,
  now,
  focusNotes = false,
  onSave,
  tasks = [],
  sessionTasks = [],
  contacts = [],
  today,
  onNewTask,
  onOpenTask,
  onToggleTask,
}) {
  const [session, setSession] = useState(() => sessionOf(event))
  const finished = new Date(event.end) <= now
  const [tab, setTab] = useState(focusNotes || finished ? 'minutes' : 'agenda')
  const [status, setStatus] = useState('idle') // 'idle' | 'pending' | 'saved'
  const [clockStart, setClockStart] = useState(() => readClock(clockKey(event)))
  const [live, setLive] = useState(false)
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

  const startMeeting = () => {
    const start = clockStart ?? Date.now()
    writeClock(clockKey(event), start)
    setClockStart(start)
    setTab('minutes')
    setLive(true)
  }

  const endMeeting = () => {
    writeClock(clockKey(event), null)
    setClockStart(null)
    setLive(false)
  }

  const minutesEmpty = !session.notes.trim() && session.decisions.length === 0
  const highlight = finished && minutesEmpty && tab === 'minutes' && !live
  const doneCount = session.agenda.filter((it) => it.done).length
  const agendaCount = session.agenda.length > 0 ? `${doneCount}/${session.agenda.length}` : null

  const isDecision = (text) => session.decisions.some((d) => sameText(d.text, text))
  const addDecision = (text) => {
    if (!isDecision(text)) update('decisions', [...session.decisions, newDecision(text)])
  }

  const agendaList = (
    <ItemList
      items={session.agenda}
      onChange={(list) => update('agenda', list)}
      checkable
      itemLabel="Punto"
      addPlaceholder="Añadir un punto a tratar…"
      emptyText="Todavía no hay puntos a tratar."
    />
  )

  const minutesPanel = (
    <>
      {highlight && <p className="session-prompt">¿Qué se habló en esta reunión?</p>}
      <label className="session-subtitle" htmlFor="session-notes">
        Notas
      </label>
      <NotesEditor
        id="session-notes"
        ref={notesRef}
        className={live ? 'meeting-live-notes' : ''}
        value={session.notes}
        onChange={(text) => update('notes', text)}
        placeholder={event.recurrence ? 'Notas de este día…' : 'Lo que se habló, próximos pasos, ideas…'}
        onDecision={addDecision}
        isDecision={isDecision}
        onTask={(text) => onNewTask({ title: text, source: sourceOf(event) })}
      />
      <span className="session-subtitle">Decisiones</span>
      <ItemList
        items={session.decisions}
        onChange={(list) => update('decisions', list)}
        itemLabel="Decisión"
        addPlaceholder="Añadir una decisión…"
        emptyText="Sin decisiones apuntadas."
        renderExtra={(item) => {
          const task = taskOfDecision(tasks, item.id)
          return task ? (
            <button type="button" className="decision-task" onClick={() => onOpenTask(task)}>
              <ArrowRight size={13} strokeWidth={2} />
              tarea: {task.title}
            </button>
          ) : (
            <button
              type="button"
              className="decision-task"
              onClick={() => onNewTask({ title: item.text, source: sourceOf(event), decisionId: item.id })}
            >
              <ListTodo size={13} strokeWidth={2} />
              Convertir en tarea
            </button>
          )
        }}
      />
      <span className="session-subtitle">Tareas</span>
      {sessionTasks.length === 0 && <p className="session-empty">Sin tareas de esta reunión.</p>}
      {sessionTasks.length > 0 && (
        <ul className="task-list">
          {sessionTasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              contacts={contacts}
              today={today}
              onToggle={onToggleTask}
              onOpen={onOpenTask}
              showSource={false}
            />
          ))}
        </ul>
      )}
      <button type="button" className="session-tasks-add" onClick={() => onNewTask({ source: sourceOf(event) })}>
        <Plus size={16} strokeWidth={2} />
        Nueva tarea
      </button>
    </>
  )

  return (
    <section ref={sectionRef} className={`session${highlight ? ' highlight' : ''}`} aria-label="Agenda y acta">
      <button type="button" className={`session-start${clockStart ? ' running' : ''}`} onClick={startMeeting}>
        {clockStart ? <Timer size={17} strokeWidth={1.9} /> : <Play size={17} strokeWidth={1.9} />}
        {clockStart ? 'Volver a la reunión' : 'Empezar reunión'}
        {clockStart && (
          <span className="session-start-clock">
            <Elapsed since={clockStart} />
          </span>
        )}
      </button>

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
            {agendaCount && <span className="session-tab-count">{agendaCount}</span>}
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
        <SaveStatus status={status} />
      </div>

      <div id="session-panel" role="tabpanel" aria-labelledby={`session-tab-${tab}`} className="session-panel">
        {event.recurrence && <p className="session-scope">Solo de la sesión de este día.</p>}
        {live ? (
          <p className="session-empty">La reunión está abierta a pantalla completa.</p>
        ) : tab === 'agenda' ? (
          agendaList
        ) : (
          minutesPanel
        )}
      </div>

      {event.recurrence && <SessionHistory event={event} />}

      {live && clockStart && (
        <MeetingLive
          event={event}
          clockStart={clockStart}
          status={status}
          agenda={agendaList}
          minutes={minutesPanel}
          agendaCount={agendaCount}
          onEnd={endMeeting}
        />
      )}
    </section>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react'
import MeetingFormModal from './MeetingFormModal.jsx'
import MeetingDetailModal from './MeetingDetailModal.jsx'
import ClassDetailModal from './ClassDetailModal.jsx'
import {
  addDaysKey,
  classItem,
  dayLabel,
  daysRange,
  errorText,
  hhmmOf,
  itemsByDay,
  keyOf,
  listMyClasses,
  listMyMeetings,
  meetingItem,
  mondayOf,
  weekKeys,
  weekLabel,
} from '../../lib/sharedCalendar'
import { zoneShort } from '../../lib/studentPortal'
import './SharedCalendar.css'

const EMPTY = { meetings: [], classes: [] }

function itemClass(item) {
  if (item.kind === 'class') return 'sc-item class'
  const m = item.meeting
  if (m.cancelled) return 'sc-item cancelled'
  return `sc-item ${m.my_status === 'accepted' ? '' : m.my_status}`
}

function itemTag(item, meId) {
  if (item.kind === 'class') {
    const c = item.cls
    return c.kind === 'profesor' ? `Clase que das · ${c.confirmed} confirmados` : `Clase${c.teacher_name ? ` · ${c.teacher_name}` : ''}${c.my_status === 'yes' ? ' · Vas' : c.my_status === 'no' ? ' · No irás' : ''}`
  }
  const m = item.meeting
  if (m.cancelled) return 'Cancelada'
  if (m.organizer_id === meId) {
    const accepted = m.participants.filter((p) => p.id !== meId && p.status === 'accepted').length
    return `Organizas · ${accepted} de ${m.participants.length - 1} han aceptado`
  }
  return { pending: 'Pendiente', declined: 'Rechazada', accepted: 'Aceptada' }[m.my_status]
}

// Calendario compartido de una persona (alumno o equipo): su semana, en su zona, con sus
// reuniones compartidas y sus clases. «Nueva reunión», y al pulsar algo, su ficha.
// asId + readOnly: «Ver como» de la ceo (lee el calendario de esa persona, sin poder cambiar nada).
export default function SharedCalendar({ client, meId, zone, asId = null, readOnly = false }) {
  const [monday, setMonday] = useState(() => mondayOf(keyOf(new Date(), zone)))
  const [data, setData] = useState(null) // { meetings, classes }
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)
  const [open, setOpen] = useState(null) // item
  const [form, setForm] = useState(null) // { meeting } (null: nueva)

  useEffect(() => {
    if (!client) return
    let active = true
    const { start, end } = daysRange(monday, 7, zone)
    Promise.all([listMyMeetings(client, start, end, asId), listMyClasses(client, start, end, asId)]).then(
      ([meetings, classes]) => {
        if (!active) return
        setData({ meetings: meetings || [], classes: classes || [] })
        setError(null)
      },
      (err) => active && setError(errorText(err)),
    )
    return () => {
      active = false
    }
  }, [client, monday, zone, asId, reload])

  const refresh = useCallback(() => setReload((n) => n + 1), [])
  const days = useMemo(() => weekKeys(monday), [monday])
  const today = keyOf(new Date(), zone)
  // Sin cliente (vista previa de un ejemplo, sin cuenta): la semana vacía.
  const shown = client ? data : EMPTY
  const byDay = useMemo(() => {
    if (!shown) return null
    return itemsByDay([...shown.meetings.map(meetingItem), ...shown.classes.map(classItem)], days, zone)
  }, [shown, days, zone])

  return (
    <div className="sc-root">
      <div className="sc-head">
        <div>
          <h1>Calendario</h1>
          <p className="sc-zone">Horas en tu zona: {zoneShort(zone)}</p>
        </div>
        <button type="button" className="sc-btn-primary" disabled={readOnly || !client} onClick={() => setForm({ meeting: null })}>
          <CalendarPlus size={16} strokeWidth={1.75} />
          Nueva reunión
        </button>
      </div>

      <div className="sc-toolbar">
        <button type="button" className="sc-btn" onClick={() => setMonday(mondayOf(today))}>
          Hoy
        </button>
        <button type="button" className="sc-btn sc-icon-btn" onClick={() => setMonday(addDaysKey(monday, -7))} aria-label="Semana anterior">
          <ChevronLeft size={16} />
        </button>
        <button type="button" className="sc-btn sc-icon-btn" onClick={() => setMonday(addDaysKey(monday, 7))} aria-label="Semana siguiente">
          <ChevronRight size={16} />
        </button>
        <span className="sc-week-label">{weekLabel(monday)}</span>
      </div>

      {error ? (
        <p className="sc-message error">{error}</p>
      ) : !byDay ? (
        <p className="sc-message">Cargando…</p>
      ) : (
        <div className="sc-week">
          {days.map((key) => {
            const items = byDay.get(key) || []
            return (
              <section key={key} className={`sc-day${key === today ? ' today' : ''}`} aria-label={dayLabel(key)}>
                <span className="sc-day-name">{dayLabel(key)}</span>
                {items.length === 0 && <span className="sc-day-empty">Nada</span>}
                {items.map((item) => (
                  <button key={item.id} type="button" className={itemClass(item)} onClick={() => setOpen(item)}>
                    <span className="sc-item-time">
                      {hhmmOf(item.start, zone)}–{hhmmOf(item.end, zone)}
                    </span>
                    <span className="sc-item-title">{item.title}</span>
                    <span className="sc-item-tag">{itemTag(item, meId)}</span>
                  </button>
                ))}
              </section>
            )
          })}
        </div>
      )}

      {open?.kind === 'meeting' && (
        <MeetingDetailModal
          client={client}
          meeting={open.meeting}
          meId={meId}
          zone={zone}
          readOnly={readOnly}
          onClose={() => setOpen(null)}
          onChanged={() => {
            setOpen(null)
            refresh()
          }}
          onEdit={(meeting) => {
            setOpen(null)
            setForm({ meeting })
          }}
        />
      )}
      {open?.kind === 'class' && (
        <ClassDetailModal client={client} cls={open.cls} zone={zone} readOnly={readOnly} onClose={() => setOpen(null)} onChanged={refresh} />
      )}
      {form && (
        <MeetingFormModal
          client={client}
          meId={meId}
          zone={zone}
          meeting={form.meeting}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

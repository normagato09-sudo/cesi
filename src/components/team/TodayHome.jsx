import { useEffect, useState } from 'react'
import { LogIn, LogOut } from 'lucide-react'
import { clockIn, errorText, listClockEntries, openEntry } from '../../lib/teamWork'
import { STATUS_LABELS, daysRange, hhmmOf, keyOf, listMyClasses, listMyMeetings } from '../../lib/sharedCalendar'
import './TeamWork.css'

const DAY_MS = 86400000

/**
 * «Fichar» en el Inicio del equipo: si tiene la entrada fichada (y desde cuándo) y el botón. La
 * entrada se ficha aquí mismo; la salida, en «Fichaje» (pide lo que ha hecho). asId + readOnly:
 * «Ver como» de la ceo. onOpen: ir a «Fichaje».
 */
export function ClockHomeCard({ client, zone, asId = null, readOnly = false, onOpen }) {
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!client) return
    let active = true
    const now = Date.now()
    listClockEntries(client, new Date(now - DAY_MS), new Date(now + 60000), { asId }).then(
      (rows) => active && setState({ open: openEntry(rows || []), error: null }),
      (err) => active && setState({ open: null, error: errorText(err) }),
    )
    return () => {
      active = false
    }
  }, [client, asId, reload])

  if (!client || !state) return null

  const clock = async () => {
    setBusy(true)
    try {
      await clockIn(client)
    } catch (err) {
      setState((s) => ({ ...s, error: errorText(err) }))
    }
    setBusy(false)
    setReload((n) => n + 1)
  }

  return (
    <section className="member-panel-access tw-home-tasks">
      <h2>Fichar</h2>
      {state.open ? (
        <div className="tw-home-clock">
          <span>
            Entrada fichada a las <strong>{hhmmOf(new Date(state.open.clock_in), zone)}</strong>.
          </span>
          <button type="button" className="sc-btn" onClick={onOpen}>
            <LogOut size={16} strokeWidth={1.75} />
            Fichar salida
          </button>
        </div>
      ) : (
        <div className="tw-home-clock">
          <span>No has fichado la entrada.</span>
          <button type="button" className="sc-btn-primary" onClick={clock} disabled={readOnly || busy}>
            <LogIn size={16} strokeWidth={1.75} />
            Fichar entrada
          </button>
        </div>
      )}
      {state.error && <p className="sc-message error">{state.error}</p>}
    </section>
  )
}

/**
 * «Hoy» en el Inicio del equipo: sus reuniones (las que no ha rechazado) y sus clases de hoy, por
 * hora. asId: «Ver como». onOpen: ir a su calendario.
 */
export function TodayCard({ client, zone, asId = null, onOpen }) {
  const [items, setItems] = useState(null)
  const today = keyOf(new Date(), zone)

  useEffect(() => {
    if (!client) return
    let active = true
    const { start, end } = daysRange(today, 1, zone)
    Promise.all([listMyMeetings(client, start, end, asId), listMyClasses(client, start, end, asId)]).then(
      ([meetings, classes]) => {
        if (!active) return
        const list = [
          ...(meetings || [])
            .filter((m) => !m.cancelled && m.my_status !== 'declined')
            .map((m) => ({ key: `m:${m.id}`, title: m.title || 'Reunión', start: new Date(m.starts_at), end: new Date(m.ends_at), tag: m.my_status === 'pending' ? STATUS_LABELS.pending : null })),
          ...(classes || []).map((c) => ({ key: `c:${c.course_id}:${c.class_key}`, title: c.course_name || 'Clase', start: new Date(c.starts_at), end: new Date(c.ends_at), tag: 'Clase' })),
        ]
        setItems(list.sort((a, b) => a.start - b.start))
      },
      () => active && setItems([]),
    )
    return () => {
      active = false
    }
  }, [client, zone, today, asId])

  if (!client || !items) return null
  return (
    <section className="member-panel-access tw-home-tasks">
      <h2>
        <button type="button" className="as-title-link" onClick={onOpen}>
          Hoy
        </button>
      </h2>
      {items.length === 0 ? (
        <p className="sc-zone">No tienes reuniones ni clases hoy.</p>
      ) : (
        <ul className="tw-list">
          {items.map((i) => (
            <li key={i.key} className="tw-task">
              <button type="button" className="tw-task-main" onClick={onOpen}>
                <span className="tw-task-title">{i.title}</span>
                <span className="tw-task-meta">
                  <span>
                    {hhmmOf(i.start, zone)}–{hhmmOf(i.end, zone)}
                  </span>
                  {i.tag && <span>{i.tag}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

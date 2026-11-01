import { useEffect, useState } from 'react'
import { keyOf } from '../../lib/sharedCalendar'
import { BOARDS, boardCounts, boardOf, listBoardItems, myBoardItems, reviewState, statusLabel } from '../../lib/boards'
import { boardSummary } from '../../lib/areaSummary'
import { Stats } from '../team/AreaSummary.jsx'
import '../team/TeamWork.css'
import './Boards.css'

function dayLabel(key) {
  const [y, m, d] = key.split('-')
  return `${Number(d)}/${Number(m)}/${y}`
}

/**
 * «Mi tablero» en el Inicio de una persona de un área con tablero: lo suyo sin terminar (lo
 * atrasado en rojo y lo de esta semana primero) y, en Legal, las revisiones de los próximos 30
 * días o ya pasadas. asId: «Ver como» de la ceo. onOpen: ir al tablero.
 */
export function MyBoardCard({ client, area, meId, zone, asId = null, onOpen = null }) {
  const cfg = boardOf(area)
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)
  const today = keyOf(new Date(), zone)

  useEffect(() => {
    if (!client || !cfg) return
    let active = true
    listBoardItems(client, area, asId).then(
      (rows) => active && setItems(rows || []),
      (err) => active && setError(err.message),
    )
    return () => {
      active = false
    }
  }, [client, area, asId, cfg])

  if (!client || !cfg) return null
  const { mine, reviews } = items ? myBoardItems(cfg, items, meId, today) : { mine: [], reviews: [] }
  // Primero lo atrasado y lo de esta semana; luego el resto de lo mío pendiente.
  const ordered = [...mine.filter((r) => r.late || r.week), ...mine.filter((r) => !r.late && !r.week)]
  const Main = onOpen ? 'button' : 'div'
  const row = ({ item, late }) => {
    const review = reviewState(cfg, item, today)
    return (
      <li key={item.id} className={`tw-task${late ? ' overdue' : ''}`}>
        <Main {...(onOpen ? { type: 'button', onClick: onOpen } : {})} className="tw-task-main">
          <span className="tw-task-title">{item.title}</span>
          <span className="tw-task-meta">
            <span>{statusLabel(cfg, item.status)}</span>
            {item.due_date && (
              <span className={late ? 'tw-overdue' : review === 'soon' ? 'bd-soon' : undefined}>
                {cfg.date.review ? 'Revisión: ' : late ? 'Atrasado · ' : ''}
                {dayLabel(item.due_date)}
                {item.due_time ? ` · ${item.due_time}` : ''}
              </span>
            )}
          </span>
        </Main>
      </li>
    )
  }

  return (
    <section className="member-panel-access tw-home-tasks">
      <h2>Mi tablero · {cfg.title}</h2>
      {error ? (
        <p className="sc-message error">{error}</p>
      ) : !items ? (
        <p className="sc-zone">Cargando…</p>
      ) : ordered.length === 0 && reviews.length === 0 ? (
        <>
          <BoardStats cfg={cfg} items={items} today={today} />
          <p className="sc-zone">No tienes nada pendiente.</p>
        </>
      ) : (
        <>
          <BoardStats cfg={cfg} items={items} today={today} />
          {ordered.length > 0 && <ul className="tw-list">{ordered.map(row)}</ul>}
          {reviews.length > 0 && (
            <>
              <h3 className="bd-home-sub">Revisiones próximas o pasadas</h3>
              <ul className="tw-list">{reviews.map(row)}</ul>
            </>
          )}
        </>
      )}
    </section>
  )
}

// Las cifras del tablero entero: abiertos, atrasados y de esta semana.
function BoardStats({ cfg, items, today }) {
  const s = boardSummary(cfg, items, today)
  return (
    <Stats
      items={[
        { label: 'abiertos', value: s.open },
        { label: 'atrasados', value: s.late, tone: s.late ? 'bad' : '' },
        { label: 'esta semana', value: s.week },
      ]}
    />
  )
}

// Elementos abiertos por área: [{ area, title, open }] (Directivo y la ceo). Sin la parte 17, error.
function useBoardCounts(client, asId = null) {
  const [state, setState] = useState(null)
  useEffect(() => {
    if (!client) return
    let active = true
    boardCounts(client, asId).then(
      (rows) => active && setState({ rows: (rows || []).filter((r) => BOARDS[r.area]).map((r) => ({ area: r.area, title: BOARDS[r.area].title, open: r.open_count })), error: null }),
      (err) => active && setState({ rows: [], error: err.message }),
    )
    return () => {
      active = false
    }
  }, [client, asId])
  return state
}

// El resumen de Directivo en su Inicio: elementos abiertos de cada tablero.
export function BoardCountsCard({ client, asId = null, onOpen = null }) {
  const state = useBoardCounts(client, asId)
  if (!client) return null
  return (
    <section className="member-panel-access tw-home-tasks">
      <h2>Tableros: abiertos por área</h2>
      {!state ? (
        <p className="sc-zone">Cargando…</p>
      ) : state.error ? (
        <p className="sc-message error">{state.error}</p>
      ) : (
        <ul>
          {state.rows.map((r) => (
            <li key={r.area}>
              {onOpen ? (
                <button type="button" className="bd-home-link" onClick={onOpen}>
                  {r.title}
                </button>
              ) : (
                <span>{r.title}</span>
              )}
              <strong>{r.open}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

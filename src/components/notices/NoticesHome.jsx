import { useEffect, useState } from 'react'
import NoticeCard from './NoticeCard.jsx'
import { listNotices, markNoticeRead, pendingByTeam, readSummary, unreadForMe } from '../../lib/notices'
import '../team/TeamWork.css'
import './Notices.css'

function useNotices(client, asId) {
  const [state, setState] = useState({ rows: null, error: null })
  const [reload, setReload] = useState(0)
  useEffect(() => {
    if (!client) return
    let active = true
    listNotices(client, asId).then(
      (rows) => active && setState({ rows: rows || [], error: null }),
      (err) => active && setState({ rows: [], error: err.message }),
    )
    return () => {
      active = false
    }
  }, [client, asId, reload])
  return { ...state, refresh: () => setReload((n) => n + 1) }
}

// Arriba del Inicio de cada persona de equipo: los avisos que aún no ha leído, con «Leído». Nada si
// no hay ninguno. readOnly: «Ver como» (sin marcar).
export function UnreadNotices({ client, asId = null, readOnly = false }) {
  const { rows, refresh } = useNotices(client, asId)
  if (!client || !rows) return null
  const unread = unreadForMe(rows)
  if (unread.length === 0) return null
  return (
    <section className="nt-home tw-home-tasks" aria-label="Avisos sin leer">
      <h2>Avisos sin leer ({unread.length})</h2>
      {unread.map((n) => (
        <NoticeCard
          key={n.id}
          notice={n}
          compact
          onRead={
            readOnly
              ? null
              : async (x, value) => {
                  await markNoticeRead(client, x.id, value)
                  refresh()
                }
          }
        />
      ))}
    </section>
  )
}

// «Avisos sin leer por el equipo» (la ceo y Directivo): los que tienen gente pendiente y quién
// falta. onOpen: ir a Avisos. Sin título (para meterlo en «Mi equipo»).
export function PendingNoticesList({ client, asId = null, onOpen = null }) {
  const { rows, error } = useNotices(client, asId)
  if (!client) return null
  const pending = rows ? pendingByTeam(rows) : []
  return (
    <div className="tw-home-tasks">
      {error ? (
        <p className="sc-message error">{error}</p>
      ) : !rows ? (
        <p className="sc-zone">Cargando…</p>
      ) : pending.length === 0 ? (
        <p className="sc-zone">Todo el equipo ha leído los avisos.</p>
      ) : (
        <ul className="tw-list">
          {pending.map((n) => {
            const Main = onOpen ? 'button' : 'div'
            return (
              <li key={n.id} className={`tw-task${n.important ? ' overdue' : ''}`}>
                <Main {...(onOpen ? { type: 'button', onClick: onOpen } : {})} className="tw-task-main">
                  <span className="tw-task-title">{n.title}</span>
                  <span className="tw-task-meta">
                    <span>{readSummary(n)}</span>
                  </span>
                </Main>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// El mismo bloque en el Inicio de Directivo.
export function PendingNoticesCard({ client, asId = null, onOpen = null }) {
  if (!client) return null
  return (
    <section className="member-panel-access tw-home-tasks">
      <h2>Avisos sin leer por el equipo</h2>
      <PendingNoticesList client={client} asId={asId} onOpen={onOpen} />
    </section>
  )
}

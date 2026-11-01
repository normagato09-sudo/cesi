import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import NoticeCard from './NoticeCard.jsx'
import NoticeFormModal from './NoticeFormModal.jsx'
import { listNotices, markNoticeRead, unreadForMe } from '../../lib/notices'
import { listAreasForTasks } from '../../lib/teamWork'
import '../shared/SharedCalendar.css'
import './Notices.css'

// «Avisos»: los que me tocan (sin leer arriba, con «Leído») y, a quien publica (la ceo y
// Directivo), todos, con quién los ha leído; publica, edita y borra. me: { id, role, area }.
// asId + readOnly: «Ver como» de la ceo (sin publicar ni marcar).
export default function NoticesView({ client, me, asId = null, readOnly = false }) {
  const publisher = me.role === 'ceo' || me.area === 'direccion'
  const [notices, setNotices] = useState(null)
  const [areas, setAreas] = useState([])
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)
  const [editing, setEditing] = useState(null) // { notice } (null: nuevo)

  useEffect(() => {
    if (!client) return
    let active = true
    Promise.all([listNotices(client, asId), publisher ? listAreasForTasks(client) : []]).then(
      ([rows, areaRows]) => {
        if (!active) return
        setNotices(rows || [])
        setAreas(areaRows || [])
        setError(null)
      },
      (err) => active && setError(err.message),
    )
    return () => {
      active = false
    }
  }, [client, asId, publisher, reload])

  const refresh = () => setReload((n) => n + 1)
  const onRead = readOnly
    ? null
    : async (n, value) => {
        await markNoticeRead(client, n.id, value)
        refresh()
      }
  const canPublish = publisher && !readOnly && !!client

  const list = notices || []
  const unread = unreadForMe(list)
  const rest = list.filter((n) => !unread.includes(n) && !n.expired)
  const expired = list.filter((n) => n.expired)
  const card = (n) => (
    <NoticeCard
      key={n.id}
      notice={n}
      onRead={n.for_me && !n.expired ? onRead : null}
      onEdit={canPublish && n.can_edit ? (x) => setEditing({ notice: x }) : null}
      showStats={publisher}
    />
  )

  return (
    <div className="sc-root">
      <div className="sc-head">
        <div>
          <h1>Avisos</h1>
          <p className="sc-zone">{publisher ? 'Los avisos del equipo y quién los ha leído.' : 'Los avisos para ti y para tu área.'}</p>
        </div>
        {publisher && (
          <button type="button" className="sc-btn-primary" disabled={!canPublish} onClick={() => setEditing({ notice: null })}>
            <Plus size={16} strokeWidth={2} />
            Nuevo aviso
          </button>
        )}
      </div>

      {error ? (
        <p className="sc-message error">{error}</p>
      ) : !client ? (
        <p className="sc-message">No hay avisos.</p>
      ) : !notices ? (
        <p className="sc-message">Cargando…</p>
      ) : list.length === 0 ? (
        <p className="sc-message">Todavía no hay avisos.</p>
      ) : (
        <>
          {unread.length > 0 && (
            <section className="nt-section">
              <h2>Sin leer ({unread.length})</h2>
              {unread.map(card)}
            </section>
          )}
          {rest.length > 0 && (
            <section className="nt-section">
              <h2>{unread.length > 0 ? 'El resto' : 'Avisos'}</h2>
              {rest.map(card)}
            </section>
          )}
          {expired.length > 0 && (
            <section className="nt-section">
              <h2>Caducados ({expired.length})</h2>
              {expired.map(card)}
            </section>
          )}
        </>
      )}

      {editing && (
        <NoticeFormModal
          client={client}
          notice={editing.notice}
          areas={areas}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

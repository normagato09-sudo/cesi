import { useEffect, useState } from 'react'
import { keyOf } from '../../lib/sharedCalendar'
import { fetchScreenData } from '../../lib/screenData'
import { allianceErrorText, allianceStats, dayLabel, nextSteps } from '../../lib/alliances'
import '../team/TeamWork.css'
import './Alliances.css'

// «Próximos pasos» en el Inicio de Alianzas: los atrasados (en rojo) y los de esta semana, de las
// alianzas abiertas. asId: «Ver como» de la ceo. onOpen: ir a la pantalla Alianzas.
export function NextStepsCard({ client, zone, asId = null, onOpen = null }) {
  const [contacts, setContacts] = useState(null)
  const [error, setError] = useState(null)
  const today = keyOf(new Date(), zone)

  useEffect(() => {
    if (!client) return
    let active = true
    fetchScreenData(client, 'contactos', asId).then(
      (data) => active && setContacts(data.contacts),
      (err) => active && setError(allianceErrorText(err)),
    )
    return () => {
      active = false
    }
  }, [client, asId])

  if (!client) return null
  const { overdue, week } = contacts ? nextSteps(contacts, today) : { overdue: [], week: [] }
  const rows = [...overdue.map((r) => ({ ...r, late: true })), ...week]
  const Main = onOpen ? 'button' : 'div'
  return (
    <section className="member-panel-access tw-home-tasks">
      <h2>Próximos pasos</h2>
      {error ? (
        <p className="sc-message error">{error}</p>
      ) : !contacts ? (
        <p className="sc-zone">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="sc-zone">Nada atrasado ni para esta semana.</p>
      ) : (
        <ul className="tw-list">
          {rows.map(({ contact, alliance, late }) => (
            <li key={contact.id} className={`tw-task${late ? ' overdue' : ''}`}>
              <Main {...(onOpen ? { type: 'button', onClick: onOpen } : {})} className="tw-task-main">
                <span className="tw-task-title">{alliance.nextStep || 'Próximo paso sin describir'}</span>
                <span className="tw-task-meta">
                  <span>{contact.name || 'Sin nombre'}</span>
                  <span className={late ? 'tw-overdue' : undefined}>{late ? `Atrasado · ${dayLabel(alliance.nextStepDate)}` : dayLabel(alliance.nextStepDate)}</span>
                  {alliance.ownerName && <span>{alliance.ownerName}</span>}
                </span>
              </Main>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// Cifras de alianzas (Directivo y la ceo): cerradas este mes y en negociación.
function useAllianceStats(client, asId = null) {
  const [stats, setStats] = useState(null)
  useEffect(() => {
    if (!client) return
    let active = true
    allianceStats(client, asId).then(
      (row) => active && setStats({ ...row, error: null }),
      (err) => active && setStats({ closed_month: 0, negotiating: 0, error: err.message }),
    )
    return () => {
      active = false
    }
  }, [client, asId])
  return stats
}

// El resumen de Directivo en su Inicio (solo cifras).
export function AllianceStatsCard({ client, asId = null }) {
  const stats = useAllianceStats(client, asId)
  if (!client) return null
  return (
    <section className="member-panel-access tw-home-tasks">
      <h2>Alianzas</h2>
      {!stats ? (
        <p className="sc-zone">Cargando…</p>
      ) : stats.error ? (
        <p className="sc-message error">{stats.error}</p>
      ) : (
        <ul>
          <li>
            <span>Cerradas este mes</span>
            <strong>{stats.closed_month}</strong>
          </li>
          <li>
            <span>En negociación</span>
            <strong>{stats.negotiating}</strong>
          </li>
        </ul>
      )}
    </section>
  )
}

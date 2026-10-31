import { useEffect, useState } from 'react'
import GoalItem from './GoalItem.jsx'
import { keyOf } from '../../lib/sharedCalendar'
import { goalErrorText, listGoals, monthStart } from '../../lib/goals'
import './Goals.css'

// «Objetivos de mi área» en el Inicio de una persona de equipo: los de este mes con su barra (y
// los «Sin cerrar» de meses anteriores). asId: «Ver como» de la ceo. onOpenAll: ir a Objetivos.
export default function AreaGoals({ client, area, zone, asId = null, onOpenAll }) {
  const [goals, setGoals] = useState(null)
  const [error, setError] = useState(null)
  const month = monthStart(keyOf(new Date(), zone))

  useEffect(() => {
    if (!client || !area) return
    let active = true
    listGoals(client, month, { area, asId }).then(
      (rows) => active && setGoals(rows || []),
      (err) => active && setError(goalErrorText(err)),
    )
    return () => {
      active = false
    }
  }, [client, area, month, asId])

  if (!client || !area) return null
  return (
    <section className="member-panel-access tw-home-tasks">
      <h2>Objetivos de mi área</h2>
      {error ? (
        <p className="sc-message error">{error}</p>
      ) : !goals ? (
        <p className="sc-zone">Cargando…</p>
      ) : goals.length === 0 ? (
        <p className="sc-zone">Tu área no tiene objetivos este mes.</p>
      ) : (
        <ul className="gl-goals">
          {goals.map((g) => (
            <GoalItem key={g.id} goal={g} compact showMonth={g.month < month} onOpen={onOpenAll} />
          ))}
        </ul>
      )}
    </section>
  )
}

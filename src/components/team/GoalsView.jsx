import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import GoalEditModal from './GoalEditModal.jsx'
import GoalItem from './GoalItem.jsx'
import { keyOf } from '../../lib/sharedCalendar'
import { MAX_GOALS_PER_AREA, canAddGoal, goalErrorText, goalsByArea, listGoals, monthLabel, monthStart, splitUnclosed } from '../../lib/goals'
import { listAreasForTasks } from '../../lib/teamWork'
import '../shared/SharedCalendar.css'
import './TeamWork.css'
import './Goals.css'

// «Objetivos»: los del mes de mi área, con su progreso; arriba, los «Sin cerrar» de meses
// anteriores. Directivo y la ceo: todas las áreas, con selector de área y de mes, y los crean,
// editan y cierran. me: { id, area, boss }. asId + readOnly: «Ver como» de la ceo.
export default function GoalsView({ client, me, zone, asId = null, readOnly = false }) {
  const thisMonth = monthStart(keyOf(new Date(), zone))
  const [month, setMonth] = useState(thisMonth)
  const [areaFilter, setAreaFilter] = useState(me.boss ? '' : me.area || '')
  const [goals, setGoals] = useState(null)
  const [areas, setAreas] = useState([])
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)
  const [editing, setEditing] = useState(null) // { goal } o { start: { area, month } }

  useEffect(() => {
    if (!client || (!me.boss && !me.area)) return
    let active = true
    Promise.all([listGoals(client, month, { area: areaFilter || null, asId }), listAreasForTasks(client)]).then(
      ([rows, areaRows]) => {
        if (!active) return
        setGoals(rows || [])
        setAreas(areaRows)
        setError(null)
      },
      (err) => active && setError(goalErrorText(err)),
    )
    return () => {
      active = false
    }
  }, [client, month, areaFilter, asId, me.boss, me.area, reload])

  const refresh = useCallback(() => setReload((n) => n + 1), [])
  const canManage = me.boss && !readOnly && !!client
  const { unclosed, current } = useMemo(() => splitUnclosed(goals || [], month), [goals, month])
  const shownAreas = areaFilter ? areas.filter((a) => a.id === areaFilter) : areas
  const groups = useMemo(() => goalsByArea(current, shownAreas, { allAreas: me.boss }), [current, shownAreas, me.boss])
  const saved = () => {
    setEditing(null)
    refresh()
  }

  return (
    <div className="sc-root">
      <div className="sc-head">
        <div>
          <h1>Objetivos</h1>
          <p className="sc-zone">
            {month === thisMonth ? 'Este mes' : 'Mes de'} {monthLabel(month)} · de 1 a {MAX_GOALS_PER_AREA} por área
          </p>
        </div>
      </div>

      {me.boss && (
        <div className="gl-pickers">
          <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} aria-label="Área">
            <option value="">Todas las áreas</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <input type="month" value={month.slice(0, 7)} onChange={(e) => e.target.value && setMonth(monthStart(e.target.value))} aria-label="Mes" />
          {month !== thisMonth && (
            <button type="button" className="sc-btn" onClick={() => setMonth(thisMonth)}>
              Este mes
            </button>
          )}
        </div>
      )}

      {!me.boss && !me.area ? (
        <p className="sc-message">Para ver los objetivos necesitas un área (te la da la dirección en Accesos).</p>
      ) : !client ? (
        <p className="sc-message">No hay objetivos aquí.</p>
      ) : error ? (
        <p className="sc-message error">{error}</p>
      ) : !goals ? (
        <p className="sc-message">Cargando…</p>
      ) : (
        <>
          {unclosed.length > 0 && (
            <section className="gl-area gl-unclosed">
              <h2>Sin cerrar ({unclosed.length})</h2>
              <p className="sc-zone">De meses anteriores y aún en curso{me.boss ? ': ciérralos como conseguidos o no conseguidos.' : '.'}</p>
              <ul className="gl-goals">
                {unclosed.map((g) => (
                  <GoalItem key={g.id} goal={g} showMonth onOpen={(goal) => setEditing({ goal })} />
                ))}
              </ul>
            </section>
          )}

          {groups.length === 0 ? (
            <p className="sc-message">Todavía no hay objetivos de {monthLabel(month)}.</p>
          ) : (
            groups.map((group) => (
              <section key={group.id || 'none'} className="gl-area">
                <h2>
                  <span>
                    {group.name} ({group.goals.length})
                  </span>
                  {canManage && group.id && (
                    <button
                      type="button"
                      className="sc-btn"
                      disabled={!canAddGoal(current, group.id, month)}
                      title={canAddGoal(current, group.id, month) ? undefined : `Ya tiene ${MAX_GOALS_PER_AREA} objetivos este mes.`}
                      onClick={() => setEditing({ start: { area: group.id, month } })}
                    >
                      <Plus size={14} strokeWidth={2} />
                      Objetivo
                    </button>
                  )}
                </h2>
                {group.goals.length === 0 ? (
                  <p className="sc-zone">Sin objetivos este mes.</p>
                ) : (
                  <ul className="gl-goals">
                    {group.goals.map((g) => (
                      <GoalItem key={g.id} goal={g} onOpen={(goal) => setEditing({ goal })} />
                    ))}
                  </ul>
                )}
              </section>
            ))
          )}
        </>
      )}

      {editing && (
        <GoalEditModal
          client={client}
          goal={editing.goal || null}
          start={editing.start || null}
          areas={areas}
          readOnly={readOnly}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      )}
    </div>
  )
}

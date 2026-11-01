import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Users } from 'lucide-react'
import TaskEditModal from './team/TaskEditModal.jsx'
import ClockFixModal from './team/ClockFixModal.jsx'
import { listProfiles } from '../lib/profiles'
import { listPortalsByAccount } from '../lib/studentPortal'
import { dayLabel, hhmmOf, keyOf } from '../lib/sharedCalendar'
import { MyTasksList } from './team/MyTeamTasks.jsx'
import { formatMinutes, listAreasForTasks, listClockEntries, listTeamTasks, myOpenTasks } from '../lib/teamWork'
import GoalEditModal from './team/GoalEditModal.jsx'
import GoalItem from './team/GoalItem.jsx'
import { goalErrorText, goalsByArea, listGoals, monthStart, splitUnclosed } from '../lib/goals'
import { nameOf, overdueTasks, panelRanges, splitOpenEntries, weekHoursByPerson } from '../lib/ceoPanel'
import { allianceStats } from '../lib/alliances'
import { BOARDS, boardCounts } from '../lib/boards'
import { PendingNoticesList } from './notices/NoticesHome.jsx'
import './CeoTeamPanel.css'

const ME = (id) => ({ id, role: 'ceo', area: null, boss: true })

function check({ data, error }) {
  if (error) throw error
  return data || []
}

// Todo lo de «Mi equipo» de una vez (al entrar en Inicio y con «Actualizar»).
async function loadPanel(client, zone) {
  const now = new Date()
  const r = panelRanges(now, zone)
  const month = monthStart(r.today)
  // Los objetivos aparte: sin la parte 14, el resto del panel se sigue viendo.
  const goalRows = listGoals(client, month).then(
    (rows) => ({ rows: rows || [], error: null }),
    (err) => ({ rows: [], error: goalErrorText(err) }),
  )
  // Las alianzas también aparte (sin la parte 16, sin cifras).
  const allianceRow = allianceStats(client).then(
    (row) => ({ ...row, error: null }),
    (err) => ({ closed_month: 0, negotiating: 0, error: err.message }),
  )
  // Los tableros también aparte (sin la parte 17, sin cifras).
  const boardRows = boardCounts(client).then(
    (rows) => ({ rows: (rows || []).filter((r) => BOARDS[r.area]), error: null }),
    (err) => ({ rows: [], error: err.message }),
  )
  const [profiles, portals, areas, week, open, tasks, goalResult, alliances, boards] = await Promise.all([
    listProfiles(client),
    listPortalsByAccount(client),
    listAreasForTasks(client),
    listClockEntries(client, r.week.start, r.week.end, { all: true }),
    client.from('clock_entries').select('*').is('clock_out', null).then(check),
    listTeamTasks(client),
    goalRows,
    allianceRow,
    boardRows,
  ])
  const { unclosed, current } = splitUnclosed(goalResult.rows, month)
  const goals = { error: goalResult.error, unclosed, byArea: goalsByArea(current, areas, { allAreas: true }) }
  const profilesById = new Map(profiles.map((p) => [p.id, p]))
  const nameFor = (id) => nameOf(id, profilesById, portals)
  const areaNameOf = (id) => areas.find((a) => a.id === id)?.name || 'Sin área'
  const members = profiles.filter((p) => p.role === 'equipo')
  return {
    at: now,
    today: r.today,
    areas,
    ...splitOpenEntries(open, nameFor, now),
    hours: weekHoursByPerson(members, week, nameFor, areaNameOf),
    tasks,
    overdue: overdueTasks(tasks, r.today),
    goals,
    alliances,
    boards,
  }
}

function Card({ title, count = null, children, wide = false }) {
  return (
    <section className={`ceo-card${wide ? ' wide' : ''}`}>
      <h3>
        {title}
        {count !== null && <span className="ceo-count">{count}</span>}
      </h3>
      {children}
    </section>
  )
}

// «Mi equipo» (arriba de mi Inicio, con la sincronización activa).
export default function CeoTeamPanel({ client, meId, zone }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [openTask, setOpenTask] = useState(null)
  const [openGoal, setOpenGoal] = useState(null)
  const [fixing, setFixing] = useState(null)

  useEffect(() => {
    let active = true
    loadPanel(client, zone).then(
      (next) => {
        if (!active) return
        setData(next)
        setError(null)
        setLoading(false)
      },
      (err) => {
        if (!active) return
        setError(err?.code === 'PGRST202' || err?.code === '42883' ? 'Falta ejecutar en Supabase el SQL de las partes 6 y 7.' : err?.message || 'No se pudo cargar.')
        setLoading(false)
      },
    )
    return () => {
      active = false
    }
  }, [client, meId, zone, reload])

  const refresh = useCallback(() => {
    setLoading(true)
    setReload((n) => n + 1)
  }, [])
  const done = (close) => () => {
    close(null)
    refresh()
  }

  return (
    <section className="ceo-panel" aria-label="Mi equipo">
      <div className="ceo-panel-head">
        <h2>
          <Users size={18} strokeWidth={1.75} />
          Mi equipo
        </h2>
        <div className="ceo-panel-actions">
          {data && <span className="ceo-muted">Actualizado a las {hhmmOf(data.at, zone)}</span>}
          <button type="button" className="ceo-btn" onClick={refresh} disabled={loading}>
            <RefreshCw size={14} strokeWidth={1.75} />
            {loading ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
      </div>

      {error && <p className="ceo-error">{error}</p>}

      {data && (
        <div className="ceo-grid">
          <Card title="Trabajando ahora" count={data.working.length}>
            {data.working.length === 0 ? (
              <p className="ceo-muted">Nadie tiene la entrada fichada ahora.</p>
            ) : (
              <ul className="ceo-list">
                {data.working.map((e) => (
                  <li key={e.id}>
                    <strong>{e.name}</strong>
                    <span className="ceo-muted">
                      desde las {hhmmOf(new Date(e.clock_in), zone)}
                      {keyOf(new Date(e.clock_in), zone) !== data.today ? ` (${dayLabel(keyOf(new Date(e.clock_in), zone))})` : ''} · lleva {formatMinutes(e.minutes)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Fichajes sin salida" count={data.stale.length}>
            {data.stale.length === 0 ? (
              <p className="ceo-muted">Ninguno.</p>
            ) : (
              <ul className="ceo-list">
                {data.stale.map((e) => (
                  <li key={e.id} className="ceo-row">
                    <span>
                      <strong>{e.name}</strong>
                      <span className="ceo-muted">
                        {' '}
                        · entrada el {dayLabel(keyOf(new Date(e.clock_in), zone))} a las {hhmmOf(new Date(e.clock_in), zone)}
                      </span>
                    </span>
                    <button type="button" className="ceo-btn" onClick={() => setFixing(e)}>
                      Corregir
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Horas de esta semana" wide>
            {data.hours.length === 0 ? (
              <p className="ceo-muted">Todavía no hay personas de equipo con cuenta.</p>
            ) : (
              <table className="ceo-table">
                <thead>
                  <tr>
                    <th>Persona</th>
                    <th>Área</th>
                    <th className="num">Horas</th>
                    <th className="num">Fichajes</th>
                  </tr>
                </thead>
                <tbody>
                  {data.hours.map((p) => (
                    <tr key={p.id} className={p.zero ? 'zero' : undefined}>
                      <td>{p.name}</td>
                      <td>{p.areaName}</td>
                      <td className="num">{p.zero ? '0 h' : formatMinutes(p.minutes)}</td>
                      <td className="num">{p.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="Tareas atrasadas" count={data.overdue.length}>
            {data.overdue.length === 0 ? (
              <p className="ceo-muted">Ninguna.</p>
            ) : (
              <ul className="ceo-list">
                {data.overdue.map((t) => (
                  <li key={t.id}>
                    <button type="button" className="ceo-link" onClick={() => setOpenTask(t)}>
                      <strong>{t.title}</strong>
                      <span className="ceo-muted">
                        {t.total_count ? `Falta: ${t.missing_names}` : 'Sin asignar'} · {t.area_name || 'Sin área'} ·{' '}
                        <span className="ceo-late">
                          {t.daysLate} {t.daysLate === 1 ? 'día' : 'días'} de retraso
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Mis tareas" count={myOpenTasks(data.tasks).length}>
            <div className="tw-home-tasks">
              <MyTasksList tasks={data.tasks} today={data.today} onOpen={setOpenTask} />
            </div>
          </Card>

          <Card title="Avisos sin leer por el equipo">
            <PendingNoticesList key={String(data.at)} client={client} />
          </Card>

          <Card title="Tableros: abiertos por área">
            {data.boards.error ? (
              <p className="ceo-muted">{data.boards.error}</p>
            ) : (
              <ul className="ceo-list">
                {data.boards.rows.map((r) => (
                  <li key={r.area}>
                    <span>{BOARDS[r.area].title}</span>
                    <strong>{r.open_count}</strong>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Alianzas">
            {data.alliances.error ? (
              <p className="ceo-muted">{data.alliances.error}</p>
            ) : (
              <ul className="ceo-list">
                <li>
                  <span>Cerradas este mes</span>
                  <strong>{data.alliances.closed_month}</strong>
                </li>
                <li>
                  <span>En negociación</span>
                  <strong>{data.alliances.negotiating}</strong>
                </li>
              </ul>
            )}
          </Card>

          <Card title="Objetivos de cada área (este mes)" count={data.goals.unclosed.length ? `${data.goals.unclosed.length} sin cerrar` : null} wide>
            {data.goals.error ? (
              <p className="ceo-muted">{data.goals.error}</p>
            ) : (
              <div className="tw-home-tasks ceo-goals">
                {data.goals.unclosed.length > 0 && (
                  <div className="gl-area gl-unclosed">
                    <h4>Sin cerrar</h4>
                    <ul className="gl-goals">
                      {data.goals.unclosed.map((g) => (
                        <GoalItem key={g.id} goal={g} compact showMonth onOpen={setOpenGoal} />
                      ))}
                    </ul>
                  </div>
                )}
                {data.goals.byArea.map((a) => (
                  <div key={a.id || 'none'} className="gl-area">
                    <h4>{a.name}</h4>
                    {a.goals.length === 0 ? (
                      <p className="ceo-muted">Sin objetivos este mes.</p>
                    ) : (
                      <ul className="gl-goals">
                        {a.goals.map((g) => (
                          <GoalItem key={g.id} goal={g} compact onOpen={setOpenGoal} />
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

        </div>
      )}

      {openTask && <TaskEditModal client={client} me={ME(meId)} zone={zone} task={openTask} areas={data.areas} onClose={() => setOpenTask(null)} onSaved={done(setOpenTask)} onChanged={refresh} />}
      {openGoal && <GoalEditModal client={client} goal={openGoal} areas={data.areas} onClose={() => setOpenGoal(null)} onSaved={done(setOpenGoal)} />}
      {fixing && <ClockFixModal client={client} entry={fixing} zone={zone} boss onClose={() => setFixing(null)} onSaved={done(setFixing)} />}
    </section>
  )
}

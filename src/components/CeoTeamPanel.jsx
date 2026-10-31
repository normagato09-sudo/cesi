import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Users } from 'lucide-react'
import TaskEditModal from './team/TaskEditModal.jsx'
import ClockFixModal from './team/ClockFixModal.jsx'
import { listProfiles } from '../lib/profiles'
import { listPortalsByAccount } from '../lib/studentPortal'
import { dayLabel, hhmmOf, keyOf } from '../lib/sharedCalendar'
import { formatMinutes, listAreasForTasks, listClockEntries, listTeamTasks } from '../lib/teamWork'
import { areaProgress, nameOf, overdueTasks, panelRanges, splitOpenEntries, weekHoursByPerson } from '../lib/ceoPanel'
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
  const [profiles, portals, areas, week, open, tasks] = await Promise.all([
    listProfiles(client),
    listPortalsByAccount(client),
    listAreasForTasks(client),
    listClockEntries(client, r.week.start, r.week.end, { all: true }),
    client.from('clock_entries').select('*').is('clock_out', null).then(check),
    listTeamTasks(client),
  ])
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
    overdue: overdueTasks(tasks, r.today),
    progress: areaProgress(tasks, areas, r.today, zone),
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
                        {t.assignee_name || 'Sin asignar'} · {t.area_name || 'Sin área'} ·{' '}
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

          <Card title="Progreso por área (este mes)">
            <ul className="ceo-list">
              {data.progress.map((a) => (
                <li key={a.id} className="ceo-progress">
                  <span className="ceo-progress-name">{a.name}</span>
                  <span className="ceo-bar" aria-hidden="true">
                    <span style={{ width: `${a.total ? Math.round((a.done / a.total) * 100) : 0}%` }} />
                  </span>
                  <span className="ceo-progress-num">
                    {a.done} / {a.total}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

        </div>
      )}

      {openTask && <TaskEditModal client={client} me={ME(meId)} task={openTask} areas={data.areas} onClose={() => setOpenTask(null)} onSaved={done(setOpenTask)} />}
      {fixing && <ClockFixModal client={client} entry={fixing} zone={zone} boss onClose={() => setFixing(null)} onSaved={done(setFixing)} />}
    </section>
  )
}

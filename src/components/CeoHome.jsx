import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarDays, ChevronRight, RefreshCw } from 'lucide-react'
import { listProfiles } from '../lib/profiles'
import { listPortalsByAccount } from '../lib/studentPortal'
import { hhmmOf, keyOf } from '../lib/sharedCalendar'
import { formatMinutes, listAreasForTasks, listClockEntries, listTeamTasks } from '../lib/teamWork'
import { listGoals, monthStart } from '../lib/goals'
import { nameOf, overdueTasks, panelRanges, splitOpenEntries, weekHoursByPerson } from '../lib/ceoPanel'
import { attendanceOfMonth, coursesSummary } from '../lib/areaSummary'
import { greeting } from '../lib/home'
import { accountsToPromote, attentionItems, goalsDonePercent, meetingsToday, newStudentAccounts } from '../lib/ceoHome'
import './CeoHome.css'

function check({ data, error }) {
  if (error) throw error
  return data || []
}

// Lo del equipo de una vez (al entrar en Inicio y con «Actualizar»). Los objetivos aparte: sin la
// parte 14, el resto se sigue viendo.
async function loadTeam(client, zone) {
  const now = new Date()
  const r = panelRanges(now, zone)
  const goals = listGoals(client, monthStart(r.today), { withUnclosed: false }).then(
    (rows) => rows || [],
    () => null,
  )
  const [profiles, portals, areas, week, open, tasks, goalRows] = await Promise.all([
    listProfiles(client),
    listPortalsByAccount(client),
    listAreasForTasks(client),
    listClockEntries(client, r.week.start, r.week.end, { all: true }),
    client.from('clock_entries').select('*').is('clock_out', null).then(check),
    listTeamTasks(client),
    goals,
  ])
  const profilesById = new Map(profiles.map((p) => [p.id, p]))
  const nameFor = (id) => nameOf(id, profilesById, portals)
  const areaNameOf = (id) => areas.find((a) => a.id === id)?.name || 'Sin área'
  return {
    at: now,
    profiles,
    ...splitOpenEntries(open, nameFor, now),
    hours: weekHoursByPerson(
      profiles.filter((p) => p.role === 'equipo'),
      week,
      nameFor,
      areaNameOf,
    ),
    overdue: overdueTasks(tasks, r.today),
    goals: goalRows,
  }
}

function Card({ title, action = null, className = '', children }) {
  return (
    <section className={`ch-card ${className}`}>
      <div className="ch-card-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/**
 * Inicio de la ceo: «Necesita tu atención», «Tu equipo hoy», «De un vistazo» y «Tu agenda de hoy».
 * client: el de la sincronización (null sin ella: solo lo de este dispositivo). local: mis datos
 * { courses, students, attendance, contacts }. sharedRows: las reuniones compartidas que ya se
 * leen para el calendario. onGoTo(sección): abrir una pantalla.
 */
export default function CeoHome({ client = null, zone, now, local, rawEvents, sharedRows = [], proposalsCount = 0, unreadMessages = 0, newApplications = 0, onGoTo }) {
  const [team, setTeam] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(!!client)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!client) return
    let active = true
    loadTeam(client, zone).then(
      (next) => {
        if (!active) return
        setTeam(next)
        setError(null)
        setLoading(false)
      },
      (err) => {
        if (!active) return
        setError(err?.message || 'No se pudo cargar lo del equipo.')
        setLoading(false)
      },
    )
    return () => {
      active = false
    }
  }, [client, zone, reload])

  const refresh = useCallback(() => {
    setLoading(true)
    setReload((n) => n + 1)
  }, [])

  const dateText = format(now, "EEEE, d 'de' MMMM", { locale: es })
  const month = keyOf(now, zone).slice(0, 7)
  const items = attentionItems({
    newStudents: team ? newStudentAccounts(team.profiles, now).length : 0,
    toPromote: team ? accountsToPromote(team.profiles, local.contacts).length : 0,
    stale: team?.stale.length || 0,
    overdue: team?.overdue.length || 0,
    proposals: proposalsCount,
    unread: unreadMessages,
    applications: newApplications,
  })
  const enrolled = coursesSummary(local.courses, local.students).enrolled
  const attendance = attendanceOfMonth(local.attendance, month).percent
  const goalsPercent = team?.goals ? goalsDonePercent(team.goals) : null
  const meetings = meetingsToday(rawEvents, sharedRows, now)
  const glance = [
    { label: 'alumnos inscritos', value: enrolled, section: 'students' },
    { label: 'asistencia media del mes', value: attendance === null ? '—' : `${attendance} %`, section: 'courses' },
    { label: 'tareas atrasadas', value: team ? team.overdue.length : '—', section: 'team-tasks', tone: team?.overdue.length ? 'bad' : '' },
    { label: 'objetivos del mes cumplidos', value: goalsPercent === null ? '—' : `${goalsPercent} %`, section: 'goals' },
  ]

  return (
    <div className="ch-root">
      <header className="ch-header">
        <div>
          <h1>{greeting(now)}</h1>
          <p>{dateText.charAt(0).toUpperCase() + dateText.slice(1)}</p>
        </div>
        {client && (
          <button type="button" className="ch-btn" onClick={refresh} disabled={loading}>
            <RefreshCw size={14} strokeWidth={1.75} />
            {loading ? 'Actualizando…' : 'Actualizar'}
          </button>
        )}
      </header>

      {error && <p className="ch-error">{error}</p>}

      <div className="ch-grid">
        <Card title="Necesita tu atención">
          {loading && !team ? (
            <p className="ch-muted">Cargando…</p>
          ) : items.length === 0 ? (
            <p className="ch-ok">Todo en orden ✓</p>
          ) : (
            <ul className="ch-attention">
              {items.map((i) => (
                <li key={i.id}>
                  <button type="button" onClick={() => onGoTo(i.section)}>
                    <strong>{i.count}</strong>
                    <span>{i.label}</span>
                    <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Tu equipo hoy"
          action={
            client && (
              <button type="button" className="ch-link" onClick={() => onGoTo('clockins')}>
                Fichajes
              </button>
            )
          }
        >
          {!client ? (
            <p className="ch-muted">Con la sincronización activa verás quién está trabajando.</p>
          ) : !team ? (
            <p className="ch-muted">{loading ? 'Cargando…' : '—'}</p>
          ) : (
            <>
              <p className="ch-label">Trabajando ahora</p>
              {team.working.length === 0 ? (
                <p className="ch-muted">Nadie tiene la entrada fichada.</p>
              ) : (
                <ul className="ch-people">
                  {team.working.map((e) => (
                    <li key={e.id}>
                      <span className="ch-dot" aria-hidden="true" />
                      <strong>{e.name}</strong>
                      <span className="ch-muted">desde las {hhmmOf(new Date(e.clock_in), zone)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="ch-label">Horas de esta semana</p>
              {team.hours.length === 0 ? (
                <p className="ch-muted">Todavía no hay personas de equipo con cuenta.</p>
              ) : (
                <ul className="ch-hours">
                  {team.hours.map((p) => (
                    <li key={p.id} className={p.zero ? 'zero' : undefined}>
                      <span>{p.name}</span>
                      <strong>{p.zero ? '0 h' : formatMinutes(p.minutes)}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>

        <Card title="De un vistazo" className="wide">
          <ul className="ch-glance">
            {glance.map((g) => (
              <li key={g.label}>
                <button type="button" className={g.tone || undefined} onClick={() => onGoTo(g.section)}>
                  <strong>{g.value}</strong>
                  <span>{g.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title="Tu agenda de hoy"
          className="wide"
          action={
            <button type="button" className="ch-link" onClick={() => onGoTo('calendar')}>
              <CalendarDays size={14} strokeWidth={1.75} />
              Calendario
            </button>
          }
        >
          {meetings.length === 0 ? (
            <p className="ch-muted">No tienes reuniones hoy.</p>
          ) : (
            <ul className="ch-agenda">
              {meetings.map((m) => (
                <li key={`${m.id}|${m.start.getTime()}`}>
                  <span className="ch-time">
                    {hhmmOf(m.start, zone)} – {hhmmOf(m.end, zone)}
                  </span>
                  <span className="ch-agenda-title">{m.title || 'Sin título'}</span>
                  {m.shared && <span className="ch-tag">Compartida</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

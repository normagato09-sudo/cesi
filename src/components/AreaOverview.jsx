import { useMemo } from 'react'
import { Stats } from './team/AreaSummary.jsx'
import { BOARDS } from '../lib/boards'
import { euros } from '../lib/finance'
import { allianceSummary, attendanceOfMonth, coursesSummary, recruitmentSummary, tasksAndGoalsByArea } from '../lib/areaSummary'
import './team/TeamWork.css'
import './AreaOverview.css'

/**
 * «Cómo va cada área» (Inicio de la ceo): una tarjeta por área con sus cifras clave y, en todas, las
 * tareas atrasadas y los objetivos del mes con su %. Al pulsarla, se abre su pantalla (onGoTo).
 * local: mis datos { courses, students, attendance, vacancies, contacts }. panel: lo de «Mi equipo»
 * (areas, tasks, goalRows, boards, finance). today: 'AAAA-MM-DD' en mi zona.
 */
export default function AreaOverview({ local, panel, today, zone, onGoTo }) {
  const month = today.slice(0, 7)
  const cards = useMemo(() => {
    const byArea = tasksAndGoalsByArea(panel.tasks || [], panel.goalRows || [], today)
    const boardRow = (area) => (panel.boards?.rows || []).find((r) => r.area === area)
    return (panel.areas || []).map((a) => {
      let stats = []
      let section = 'team-tasks'
      if (a.id === 'formacion') {
        const c = coursesSummary(local.courses, local.students)
        const att = attendanceOfMonth(local.attendance, month)
        stats = [
          { label: 'cursos activos', value: c.active },
          { label: 'alumnos inscritos', value: c.enrolled },
          { label: 'asistencia del mes', value: att.percent === null ? '—' : `${att.percent} %` },
          { label: 'faltas sin justificar', value: att.unjustified, tone: att.unjustified ? 'warn' : '' },
        ]
        section = 'courses'
      } else if (a.id === 'personas') {
        const r = recruitmentSummary(local.vacancies, local.contacts)
        stats = [
          { label: 'vacantes abiertas', value: r.openVacancies },
          { label: 'candidatos en proceso', value: r.inProcess },
        ]
        section = 'vacancies'
      } else if (a.id === 'alianzas') {
        const s = allianceSummary(local.contacts, today, zone)
        stats = [
          { label: 'en negociación', value: s.negotiating },
          { label: 'cerradas este mes', value: s.closedMonth, tone: s.closedMonth ? 'good' : '' },
        ]
        section = 'alliances'
      } else if (a.id === 'finanzas') {
        const f = panel.finance
        stats = f && !f.error ? [{ label: 'saldo del mes', value: euros(f.balance), tone: f.balance < 0 ? 'bad' : '' }] : []
        section = 'finance'
      } else if (BOARDS[a.id]) {
        const b = boardRow(a.id)
        stats = b
          ? [
              { label: 'abiertos', value: b.open_count },
              ...(b.late_count !== undefined ? [{ label: 'atrasados', value: b.late_count, tone: b.late_count ? 'bad' : '' }] : []),
            ]
          : []
        section = 'boards'
      }
      const extra = byArea[a.id] || { lateTasks: 0, goals: [] }
      return { id: a.id, name: a.name, stats, section, lateTasks: extra.lateTasks, goals: extra.goals }
    })
  }, [local, panel, today, month, zone])

  return (
    <div className="ao-grid">
      {cards.map((c) => (
        <button key={c.id} type="button" className="ao-card" onClick={() => onGoTo(c.section)} aria-label={`${c.name}: abrir su pantalla`}>
          <span className="ao-head">
            <strong>{c.name}</strong>
            {c.lateTasks > 0 && (
              <span className="ao-late">
                {c.lateTasks} {c.lateTasks === 1 ? 'tarea atrasada' : 'tareas atrasadas'}
              </span>
            )}
          </span>
          {c.stats.length > 0 && <Stats items={c.stats} />}
          {c.goals.length > 0 ? (
            <span className="ao-goals">
              {c.goals.map((g) => (
                <span key={g.id} className="ao-goal">
                  <span className="ao-goal-title">{g.title}</span>
                  <span className="ao-bar" aria-hidden="true">
                    <span style={{ width: `${g.percent}%` }} />
                  </span>
                  <span className="ao-goal-num">{g.percent} %</span>
                </span>
              ))}
            </span>
          ) : (
            <span className="ao-muted">Sin objetivos este mes</span>
          )}
        </button>
      ))}
    </div>
  )
}

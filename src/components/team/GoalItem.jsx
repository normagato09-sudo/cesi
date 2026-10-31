import { goalPercent, goalProgressText, goalStatusLabel, monthLabel } from '../../lib/goals'
import './Goals.css'

// Un objetivo con su barra de progreso. Con onOpen, se abre al pulsarlo; showMonth: con su mes
// (para los «Sin cerrar» de meses anteriores).
export default function GoalItem({ goal, onOpen = null, showMonth = false, compact = false }) {
  const percent = goalPercent(goal)
  const Main = onOpen ? 'button' : 'div'
  const badge = goal.unclosed ? 'unclosed' : goal.status
  return (
    <li className={`gl-goal${compact ? ' compact' : ''}`}>
      <Main {...(onOpen ? { type: 'button', onClick: () => onOpen(goal) } : {})} className="gl-goal-main">
        <span className="gl-goal-head">
          <span className="gl-goal-title">{goal.title}</span>
          <span className={`gl-badge ${badge}`}>{goalStatusLabel(goal)}</span>
        </span>
        <span className="gl-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`Progreso de «${goal.title}»`}>
          <span style={{ width: `${percent}%` }} />
        </span>
        <span className="gl-goal-meta">
          <span>
            {goalProgressText(goal)}
            {goal.parts_total ? ` · ${percent} %` : ''}
          </span>
          {goal.owner_name && <span>Responsable: {goal.owner_name}</span>}
          {showMonth && <span>De {monthLabel(goal.month)}</span>}
        </span>
      </Main>
    </li>
  )
}

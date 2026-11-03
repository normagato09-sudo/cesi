import { useEffect, useState } from 'react'
import { Stats } from './AreaSummary.jsx'
import { fetchScreenData, screenErrorText } from '../../lib/screenData'
import { coursesSummary } from '../../lib/areaSummary'
import { formatMinutes } from '../../lib/teamWork'
import { listOrgChart } from '../../lib/orgChart'
import './TeamWork.css'

// Las cifras del equipo (cesi_home_stats, parte 12; las personas, las cuentas de equipo de Accesos,
// cesi_org_chart, parte 28) y las de cursos (los datos de Cursos, como los ve Directivo). Cada parte
// por separado: si una falla, las otras se siguen viendo.
async function loadSummary(client, asId) {
  const [stats, courses, members] = await Promise.all([
    client.rpc('cesi_home_stats', { p_as: asId }).then(({ data, error }) => (error ? null : (data || [])[0] || null)),
    fetchScreenData(client, 'cursos', asId).then(
      (data) => coursesSummary(data.courses, data.students),
      (err) => ({ error: screenErrorText(err) }),
    ),
    listOrgChart(client).then(
      (rows) => rows.filter((r) => r.role === 'equipo').length,
      () => null,
    ),
  ])
  return { stats, courses, members }
}

/**
 * Resumen de Directivo en «Mi panel»: personas del equipo, horas fichadas esta semana, tareas
 * hechas este mes, cursos activos y alumnos inscritos. asId: «Ver como».
 */
export default function DirectivoSummary({ client, asId = null }) {
  const [state, setState] = useState(null)

  useEffect(() => {
    if (!client) return
    let active = true
    loadSummary(client, asId).then((next) => active && setState(next))
    return () => {
      active = false
    }
  }, [client, asId])

  if (!client) return null
  const s = state?.stats
  const c = state?.courses
  const value = (v) => (v === undefined || v === null ? '—' : v)

  return (
    <section className="member-panel-access tw-home-tasks">
      <h2>Resumen</h2>
      {!state ? (
        <p className="sc-zone">Cargando…</p>
      ) : (
        <>
          <Stats
            items={[
              { label: 'personas del equipo', value: value(state.members) },
              { label: 'horas fichadas esta semana', value: s ? formatMinutes(s.week_minutes) : '—' },
              { label: 'tareas hechas este mes', value: value(s?.tasks_done_month) },
              { label: 'cursos activos', value: value(c?.active) },
              { label: 'alumnos inscritos', value: value(c?.enrolled) },
            ]}
          />
          {c?.error && <p className="sc-message error">{c.error}</p>}
        </>
      )}
    </section>
  )
}

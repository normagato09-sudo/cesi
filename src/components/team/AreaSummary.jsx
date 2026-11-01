import { useEffect, useState } from 'react'
import { keyOf } from '../../lib/sharedCalendar'
import { fetchScreenData, screenErrorText } from '../../lib/screenData'
import { allianceSummary, attendanceOfMonth, recruitmentSummary, topAbsentees } from '../../lib/areaSummary'
import './TeamWork.css'

// Cifras en una fila: [{ label, value, tone }].
export function Stats({ items }) {
  return (
    <ul className="as-stats">
      {items.map((s) => (
        <li key={s.label} className={s.tone || undefined}>
          <strong>{s.value}</strong>
          <span>{s.label}</span>
        </li>
      ))}
    </ul>
  )
}

// Lo que necesita el resumen (los datos de esa pantalla, como los ve esa persona).
const SCREEN_OF = { formacion: 'asistencia', personas: 'vacantes', alianzas: 'contactos' }

/**
 * El resumen propio del área en «Mi panel»: Profesor (asistencia media de sus cursos este mes y
 * alumnos con más faltas), RRHH (vacantes abiertas, candidatos por estado y en entrevista) y
 * Alianzas (en negociación, cerradas este mes y pasos atrasados). Nada en las demás áreas.
 * asId: «Ver como». onOpen: ir a su pantalla.
 */
export default function AreaSummary({ client, area, zone, asId = null, onOpen = null }) {
  const screen = SCREEN_OF[area]
  const [state, setState] = useState(null)

  useEffect(() => {
    if (!client || !screen) return
    let active = true
    fetchScreenData(client, screen, asId).then(
      (data) => active && setState({ data, error: null }),
      (err) => active && setState({ data: null, error: screenErrorText(err) }),
    )
    return () => {
      active = false
    }
  }, [client, screen, asId])

  if (!client || !screen) return null
  const today = keyOf(new Date(), zone)
  const month = today.slice(0, 7)
  const title = { formacion: 'Mis cursos este mes', personas: 'Selección', alianzas: 'Alianzas' }[area]
  let body = <p className="sc-zone">Cargando…</p>

  if (state?.error) body = <p className="sc-message error">{state.error}</p>
  else if (state?.data) {
    const { courses, students, attendance, vacancies, contacts } = state.data
    if (area === 'formacion') {
      const stats = attendanceOfMonth(attendance, month)
      const top = topAbsentees(attendance, students, month)
      body = (
        <>
          <Stats
            items={[
              { label: courses.length === 1 ? 'curso' : 'cursos', value: courses.length },
              { label: 'asistencia media', value: stats.percent === null ? '—' : `${stats.percent} %` },
              { label: 'faltas', value: stats.absent, tone: stats.absent ? 'warn' : '' },
            ]}
          />
          {top.length > 0 && (
            <p className="sc-zone">
              Más faltas: {top.map((r) => `${r.student.name} (${r.absences})`).join(', ')}
            </p>
          )}
        </>
      )
    } else if (area === 'personas') {
      const s = recruitmentSummary(vacancies, contacts)
      body = (
        <>
          <Stats
            items={[
              { label: s.openVacancies === 1 ? 'vacante abierta' : 'vacantes abiertas', value: s.openVacancies },
              { label: 'nuevos', value: s.byStatus.new },
              { label: 'en entrevista', value: s.byStatus.interview },
              { label: 'aceptados', value: s.byStatus.accepted },
            ]}
          />
          {s.interviews.length > 0 && <p className="sc-zone">En entrevista: {s.interviews.map((i) => `${i.contact.name}${i.vacancy ? ` (${i.vacancy.title})` : ''}`).join(', ')}</p>}
        </>
      )
    } else {
      const s = allianceSummary(contacts, today, zone)
      body = (
        <Stats
          items={[
            { label: 'en negociación', value: s.negotiating },
            { label: 'cerradas este mes', value: s.closedMonth, tone: s.closedMonth ? 'good' : '' },
            { label: 'pasos atrasados', value: s.lateSteps, tone: s.lateSteps ? 'bad' : '' },
          ]}
        />
      )
    }
  }

  return (
    <section className="member-panel-access tw-home-tasks">
      <h2>
        {onOpen ? (
          <button type="button" className="as-title-link" onClick={onOpen}>
            {title}
          </button>
        ) : (
          title
        )}
      </h2>
      {body}
    </section>
  )
}

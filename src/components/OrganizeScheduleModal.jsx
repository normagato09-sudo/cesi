import { useEffect, useState } from 'react'
import { CircleAlert, Check } from 'lucide-react'
import Modal from './shared/Modal.jsx'
import { bestSchedules, canText, courseStarted, listCoursePeople, notifyScheduleChange, peopleFromRows, sameSchedule, scheduleErrorText, schedulePatch } from '../lib/autoSchedule'
import { proposalInZone } from '../lib/courseScheduling'
import { durationLabel, normalizeCourse, studentsInCourse } from '../lib/courses'
import { keyOf } from '../lib/sharedCalendar'
import { zonePlace } from '../lib/timezones'
import './OrganizeSchedule.css'

const names = (list) => list.map((p) => p.name).join(', ')

/**
 * «Organizar horario» de un curso (la ceo y Directivo): cruza la disponibilidad del profesor (libre
 * toda la clase) con la de los alumnos inscritos, cada uno en su zona (cesi_course_people, parte
 * 30), y muestra las mejores opciones. Al elegir una se guarda como horario del curso; si el curso
 * ya ha empezado y cambia, se avisa a todos los del curso. scheduler: { client, zone, save(curso,
 * cambio) }.
 */
export default function OrganizeScheduleModal({ course, scheduler, onClose }) {
  const [state, setState] = useState(null) // { teacher, students, options } o { error }
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const c = normalizeCourse(course)

  useEffect(() => {
    let active = true
    listCoursePeople(scheduler.client, course.id).then(
      (rows) => {
        if (!active) return
        const { teacher, students } = peopleFromRows(rows)
        setState({ teacher, students, options: bestSchedules({ course, teacher, students }) })
      },
      (err) => active && setState({ error: scheduleErrorText(err) }),
    )
    return () => {
      active = false
    }
  }, [scheduler.client, course])

  const choose = async (option) => {
    setBusy(option.key)
    setError(null)
    try {
      const started = courseStarted(course, keyOf(new Date(), scheduler.zone))
      await scheduler.save(course, schedulePatch(course, option.schedule, state.students))
      if (started && c.schedule && !sameSchedule(c.schedule, option.schedule)) {
        await notifyScheduleChange(scheduler.client, course.id, c.schedule, option.schedule, c.classMinutes)
      }
      onClose()
    } catch (err) {
      setError(scheduleErrorText(err))
      setBusy(null)
    }
  }

  const unknown = state?.students?.filter((s) => !s.availability) || []

  return (
    <Modal title={`Organizar horario · ${c.name}`} wide onClose={onClose}>
      <div className="os-body">
        <p className="os-intro">
          {c.classesPerWeek} {c.classesPerWeek === 1 ? 'clase' : 'clases'} por semana de {durationLabel(c.classMinutes)}. Solo salen horas en las que el profesor está
          libre toda la clase; primero, las que pueden más alumnos. Horas de {zonePlace(scheduler.zone)}: cada uno las verá en la suya.
        </p>

        {!state ? (
          <p className="os-muted">Calculando…</p>
        ) : state.error ? (
          <p className="os-error">{state.error}</p>
        ) : !state.teacher ? (
          <p className="os-warn">
            <CircleAlert size={16} strokeWidth={1.75} /> El curso no tiene profesor. Elígelo en «Editar curso».
          </p>
        ) : !state.teacher.availability ? (
          <p className="os-warn">
            <CircleAlert size={16} strokeWidth={1.75} /> {state.teacher.name} no tiene disponibilidad en su perfil: sin ella no se puede organizar.
          </p>
        ) : state.options.length === 0 ? (
          <p className="os-warn">
            <CircleAlert size={16} strokeWidth={1.75} /> No hay {c.classesPerWeek > 1 ? `${c.classesPerWeek} días distintos` : 'ninguna hora'} en los que {state.teacher.name} esté libre toda la clase.
          </p>
        ) : (
          <ol className="os-options">
            {state.options.map((o, i) => (
              <li key={o.key} className={i === 0 ? 'best' : undefined}>
                <div className="os-option-main">
                  <strong className="os-can">{canText(o)}</strong>
                  {i === 0 && <span className="os-badge">La mejor</span>}
                  <ul className="os-slots">
                    {o.slots.map((s) => (
                      <li key={s.key}>
                        {proposalInZone(s, scheduler.zone)}
                      </li>
                    ))}
                  </ul>
                  {o.cannot.length > 0 && <p className="os-muted">No pueden: {names(o.cannot)}</p>}
                </div>
                <button type="button" className="os-choose" disabled={!!busy} onClick={() => choose(o)}>
                  <Check size={14} strokeWidth={2} />
                  {busy === o.key ? 'Guardando…' : 'Elegir este horario'}
                </button>
              </li>
            ))}
          </ol>
        )}

        {unknown.length > 0 && (
          <p className="os-warn">
            <CircleAlert size={16} strokeWidth={1.75} /> Sin disponibilidad (no cuentan): {names(unknown)}.
          </p>
        )}
        {state?.options?.length > 0 && courseStarted(course, keyOf(new Date(), scheduler.zone)) && c.schedule && (
          <p className="os-muted">El curso ya ha empezado: si eliges otro horario, se avisará a todos los del curso.</p>
        )}
        {error && <p className="os-error">{error}</p>}
      </div>
    </Modal>
  )
}

/**
 * Propuesta de cambio de horario de un curso ya empezado (la deja el recálculo en
 * course.schedulePending): «Con el nuevo alumno, el martes a las 18:00 iría mejor», con Confirmar
 * (se guarda y se avisa a todos los del curso) o Descartar (se queda el horario de ahora).
 */
export function PendingScheduleBanner({ course, students, scheduler }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const pending = course.schedulePending
  if (!pending?.schedule) return null
  const enrolled = studentsInCourse(course.id, students)
  const c = normalizeCourse(course)

  const run = async (fn) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(scheduleErrorText(err))
    }
    setBusy(false)
  }
  const confirm = () =>
    run(async () => {
      await scheduler.save(course, schedulePatch(course, pending.schedule, enrolled))
      if (c.schedule && !sameSchedule(c.schedule, pending.schedule)) {
        await notifyScheduleChange(scheduler.client, course.id, c.schedule, pending.schedule, c.classMinutes)
      }
    })
  const discard = () => run(() => scheduler.save(course, { schedulePending: null, scheduleAuto: { students: enrolled.map((s) => s.id).sort(), at: new Date().toISOString() } }))

  return (
    <div className="os-pending" role="status">
      <span>
        <strong>{pending.text}</strong>
        {pending.canText ? ` (${pending.canText})` : ''}. Si lo confirmas, se avisa a todos los del curso.
      </span>
      <span className="os-pending-actions">
        <button type="button" className="cp-btn" disabled={busy} onClick={discard}>
          Descartar
        </button>
        <button type="button" className="cp-btn primary" disabled={busy} onClick={confirm}>
          Confirmar
        </button>
      </span>
      {error && <span className="os-error">{error}</span>}
    </div>
  )
}

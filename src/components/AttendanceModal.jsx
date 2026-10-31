import { useEffect, useState } from 'react'
import { ClipboardCheck, Pencil, UserCheck, X } from 'lucide-react'
import { MAX_JUSTIFICATION_LENGTH, STATUSES, classStudents, classSummary, classWhen, isJustified, myTime, recordProblem } from '../lib/attendance'
import { teacherStatus } from '../lib/courses'
import { SPAIN_ZONE, zonePlace } from '../lib/timezones'
import { listClassAttendees } from '../lib/sharedCalendar'
import { useSync } from '../lib/sync/syncContext.js'
import './EventFormModal.css'
import './StudentsView.css'

// Un alumno en el pase de lista: presente / retraso / falta y, si vino, entrada y salida (en mi
// hora, con la hora del curso al lado) y los minutos de retraso. Cada cambio se guarda al momento;
// las horas, al salir del campo (si no son válidas no se guardan y se avisa).
// Lo que el alumno ha dicho en su calendario (calendario compartido): irá o no podrá ir.
const CONFIRMATION_LABELS = { yes: 'Confirmó que irá', no: 'Dijo que no podrá ir' }

// Confirmaciones de la clase (Map id del alumno → 'yes' | 'no'). Vacío sin sincronización o sin
// el SQL de la parte 6.
function useClassConfirmations(cls) {
  const sync = useSync()
  const client = sync?.client || null
  const [map, setMap] = useState(() => new Map())
  useEffect(() => {
    if (!client) return
    let active = true
    listClassAttendees(client, cls.courseId, cls.key).then(
      (rows) => active && setMap(new Map((rows || []).filter((r) => r.status).map((r) => [r.student_id, r.status]))),
      () => {},
    )
    return () => {
      active = false
    }
  }, [client, cls.courseId, cls.key])
  return map
}

function AttendanceRow({ cls, row, actions, confirmation = null }) {
  const { student, record, enrolled } = row
  const [draft, setDraft] = useState(null) // { arrived, left, minutes } que aún no se han guardado
  const [error, setError] = useState(null)
  const came = record && record.status !== 'absent'
  const saved = {
    arrived: came ? myTime(record.arrivedAt) : '',
    left: came ? myTime(record.leftAt) : '',
    minutes: record?.lateMinutes ? String(record.lateMinutes) : '',
    reason: record?.justification || '',
  }
  const value = (field) => (draft && field in draft ? draft[field] : saved[field])
  const change = (field, v) => setDraft((d) => ({ ...(d || {}), [field]: v }))

  const run = (fn) => {
    try {
      fn()
      setDraft(null)
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }
  const mark = (status) => run(() => actions.mark(cls, student.id, status))
  const commitTimes = () => {
    if (!draft || !('arrived' in draft || 'left' in draft)) return
    run(() => actions.setTimes(cls, student.id, { arrived: value('arrived'), left: value('left') }))
  }
  const commitMinutes = () => {
    if (!draft || !('minutes' in draft)) return
    run(() => actions.setLateMinutes(cls, student.id, value('minutes')))
  }
  const canJustify = record?.status === 'late' || record?.status === 'absent'
  const justified = isJustified(record)
  const toggleJustified = (on) => run(() => actions.setJustification(cls, student.id, { justified: on, justification: value('reason') }))
  const commitReason = () => {
    if (!draft || !('reason' in draft)) return
    run(() => actions.setJustification(cls, student.id, { justified: true, justification: value('reason') }))
  }
  const inCourseZone = (field) => {
    if (!came || cls.timeZone === SPAIN_ZONE) return null
    const at = field === 'arrived' ? record.arrivedAt : record.leftAt
    return <span className="student-muted">{myTime(at, cls.timeZone)} en {zonePlace(cls.timeZone)}</span>
  }
  const warning = error || recordProblem(record)

  return (
    <li className="attendance-row">
      <div className="attendance-row-main">
        <span className="attendance-name">
          {student.name}
          {!enrolled && <span className="student-muted"> · ya no está en el curso</span>}
          {confirmation && <span className={`attendance-confirmation ${confirmation}`}>{CONFIRMATION_LABELS[confirmation]}</span>}
        </span>
        <div className="attendance-status" role="group" aria-label={`Asistencia de ${student.name}`}>
          {STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              className={`attendance-status-btn ${s.value}${record?.status === s.value ? ' on' : ''}`}
              aria-pressed={record?.status === s.value}
              onClick={() => mark(s.value)}
            >
              {s.label}
            </button>
          ))}
          {record && (
            <button type="button" className="attendance-unmark" onClick={() => run(() => actions.unmark(cls, student.id))} title="Dejar sin marcar">
              <X size={14} strokeWidth={1.75} />
              <span className="sr-only">Dejar sin marcar</span>
            </button>
          )}
        </div>
      </div>

      {came && (
        <div className="attendance-times">
          <label>
            <span>Entrada</span>
            <input type="time" value={value('arrived')} onChange={(e) => change('arrived', e.target.value)} onBlur={commitTimes} />
            {inCourseZone('arrived')}
          </label>
          <label>
            <span>Salida</span>
            <input type="time" value={value('left')} onChange={(e) => change('left', e.target.value)} onBlur={commitTimes} />
            {inCourseZone('left')}
          </label>
          {record.status === 'late' && (
            <label>
              <span>Minutos de retraso</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={600}
                value={value('minutes')}
                aria-invalid={!record.lateMinutes}
                onChange={(e) => change('minutes', e.target.value)}
                onBlur={commitMinutes}
              />
            </label>
          )}
        </div>
      )}

      {canJustify && (
        <div className="attendance-justify">
          <label className="event-form-checkbox">
            <input type="checkbox" checked={justified} onChange={(e) => toggleJustified(e.target.checked)} />
            <span>{record.status === 'late' ? 'Retraso justificado' : 'Falta justificada'}</span>
          </label>
          {justified && (
            <input
              type="text"
              value={value('reason')}
              maxLength={MAX_JUSTIFICATION_LENGTH}
              placeholder="Motivo (p. ej. cita médica)"
              aria-label={`Motivo de la justificación de ${student.name}`}
              aria-invalid={!(record.justification || '').trim()}
              onChange={(e) => change('reason', e.target.value)}
              onBlur={commitReason}
            />
          )}
        </div>
      )}

      {warning && <p className="attendance-error">{warning}</p>}
    </li>
  )
}

// Pase de lista de una clase. Las horas se escriben en mi hora (España) y se ven también en la del curso.
export default function AttendanceModal({ cls, course, contacts, students, attendance, actions, onEditExtra, onClose }) {
  const rows = classStudents(cls, students, attendance)
  const summary = classSummary(cls, students, attendance)
  const confirmations = useClassConfirmations(cls)
  const { teacher } = teacherStatus(course, contacts)

  return (
    <div className="event-form-backdrop" onClick={onClose}>
      <div className="event-form attendance-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Pase de lista">
        <div className="event-form-header">
          <h2>
            <ClipboardCheck size={17} strokeWidth={1.75} />
            Pase de lista · {course.name}
          </h2>
          <button type="button" className="event-form-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="event-form-body">
          <div className="attendance-class">
            <p>
              <strong>{classWhen(cls, cls.timeZone)}</strong>
              {cls.timeZone !== SPAIN_ZONE && <span className="student-muted"> (hora de {zonePlace(cls.timeZone)})</span>}
            </p>
            {cls.timeZone !== SPAIN_ZONE && <p>En tu hora: {classWhen(cls, SPAIN_ZONE)}</p>}
            <p className="student-muted">
              Profesor: {teacher ? teacher.name : 'sin profesor'}
              {cls.note && ` · ${cls.note}`}
              {cls.extraId && !cls.note && ' · Clase suelta'}
            </p>
            {onEditExtra && (
              <button type="button" className="contact-action-btn" onClick={onEditExtra}>
                <Pencil size={14} strokeWidth={1.75} />
                Cambiar o borrar la clase suelta
              </button>
            )}
          </div>

          {rows.length === 0 ? (
            <p className="student-muted">No hay alumnos inscritos en este curso.</p>
          ) : (
            <>
              <div className="attendance-toolbar">
                <span className="student-muted">
                  {summary.present} presentes · {summary.late} retrasos · {summary.absent} faltas · {summary.unmarked} sin marcar
                </span>
                {summary.unmarked > 0 && (
                  <button type="button" className="contact-action-btn" onClick={() => actions.markAllPresent(cls)}>
                    <UserCheck size={14} strokeWidth={1.75} />
                    Marcar presentes a los que faltan
                  </button>
                )}
              </div>
              <ul className="attendance-list">
                {rows.map((row) => (
                  <AttendanceRow key={row.student.id} cls={cls} row={row} actions={actions} confirmation={confirmations.get(row.student.id) || null} />
                ))}
              </ul>
              <p className="contact-form-hint">Se guarda solo. Entrada y salida, en tu hora. Sin marcar no cuenta como falta.</p>
            </>
          )}
        </div>

        <div className="event-form-footer">
          <button type="button" className="event-form-submit" onClick={onClose}>
            Hecho
          </button>
        </div>
      </div>
    </div>
  )
}

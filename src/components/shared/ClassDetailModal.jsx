import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'
import { confirmClass, errorText, listClassAttendees, whenLabel } from '../../lib/sharedCalendar'

const ATTENDANCE_LABELS = { yes: 'Va', no: 'No podrá ir' }

// Ficha de una clase: curso, profesor, cuándo (en mi zona) y quién ha confirmado. El alumno puede
// «Confirmar asistencia» o «No podré ir» hasta que la clase termine. readOnly: sin botones.
export default function ClassDetailModal({ client, cls, zone, readOnly = false, onClose, onChanged }) {
  const [attendees, setAttendees] = useState(null)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState(cls.my_status)
  const [busy, setBusy] = useState(false)
  const start = new Date(cls.starts_at)
  const end = new Date(cls.ends_at)
  const canAnswer = !readOnly && cls.kind === 'alumno' && end > new Date()

  useEffect(() => {
    let active = true
    listClassAttendees(client, cls.course_id, cls.class_key).then(
      (rows) => active && setAttendees(rows || []),
      (err) => active && setError(errorText(err)),
    )
    return () => {
      active = false
    }
  }, [client, cls.course_id, cls.class_key, status])

  const answer = async (next) => {
    setBusy(true)
    setError(null)
    try {
      await confirmClass(client, cls.course_id, cls.class_key, next)
      setStatus(next)
      onChanged()
    } catch (err) {
      setError(errorText(err))
    }
    setBusy(false)
  }

  const confirmed = attendees ? attendees.filter((a) => a.status === 'yes').length : 0

  return (
    <Modal title={cls.course_name || 'Clase'} onClose={onClose}>
      <div className="sc-meta">
        <span>
          <strong>{whenLabel(start, end, zone)}</strong>
        </span>
        {cls.teacher_name && <span>Profesor: {cls.teacher_name}</span>}
        {cls.is_extra && <span>Clase suelta{cls.note ? ` · ${cls.note}` : ''}</span>}
        {cls.kind === 'alumno' && (
          <span>
            {status === 'yes' ? (
              <span className="sc-badge yes">Asistencia confirmada</span>
            ) : status === 'no' ? (
              <span className="sc-badge no">Has dicho que no podrás ir</span>
            ) : (
              <span className="sc-badge pending">Sin confirmar</span>
            )}
          </span>
        )}
      </div>

      <h3 className="sc-section-title">
        Alumnos {attendees ? `(${confirmed} de ${attendees.length} confirmados)` : ''}
      </h3>
      {attendees === null && !error ? (
        <p className="sc-message">Cargando…</p>
      ) : (
        attendees && (
          <ul className="sc-people">
            {attendees.map((a) => (
              <li key={a.student_id}>
                <span>
                  {a.name}
                  {a.is_me ? ' (tú)' : ''}
                </span>
                <span className={`sc-badge ${a.status || 'pending'}`}>{ATTENDANCE_LABELS[a.status] || 'Sin confirmar'}</span>
              </li>
            ))}
          </ul>
        )
      )}

      {error && <p className="sc-message error">{error}</p>}

      {canAnswer && (
        <div className="sc-actions">
          {status !== 'no' && (
            <button type="button" className="sc-btn-danger" disabled={busy} onClick={() => answer('no')}>
              No podré ir
            </button>
          )}
          {status !== 'yes' && (
            <button type="button" className="sc-btn-primary" disabled={busy} onClick={() => answer('yes')}>
              Confirmar asistencia
            </button>
          )}
        </div>
      )}
    </Modal>
  )
}

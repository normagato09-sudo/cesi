import { useMemo } from 'react'
import { AlertTriangle, ClipboardCopy, UserRound } from 'lucide-react'
import AvailabilityGrid from './AvailabilityGrid.jsx'
import { MONTHS, hoursFromWeek, portalDiffers } from '../lib/studentPortal'
import { countryLabel, zoneLabel } from '../lib/timezones'

function birthdayText(mmdd) {
  const [month, day] = (mmdd || '').split('-').map(Number)
  return month && day ? `${day} de ${MONTHS[month - 1]}` : ''
}

// En la ficha de un alumno con cuenta (unida en Accesos): lo que ha rellenado él en su portal, en
// solo lectura. Si su país, su zona o su disponibilidad no coinciden con los de la ficha, aviso y
// «Copiar a la ficha» (solo esos tres datos).
export default function StudentAccountSection({ portal, student, onCopy }) {
  const hours = useMemo(() => hoursFromWeek(portal.availability), [portal.availability])
  const differs = portalDiffers(portal, student)

  return (
    <section className="student-account">
      <h3>
        <UserRound size={15} strokeWidth={1.75} />
        Su cuenta <span className="student-muted">· lo rellena el alumno ({portal.email})</span>
      </h3>

      {!portal.completed_at ? (
        <p className="student-muted">Todavía no ha completado su perfil.</p>
      ) : (
        <>
          {differs && (
            <div className="student-account-changed" role="status">
              <AlertTriangle size={16} strokeWidth={1.75} />
              <span>El alumno ha cambiado sus datos</span>
              <button type="button" className="contact-action-btn" onClick={onCopy}>
                <ClipboardCopy size={14} strokeWidth={1.75} />
                Copiar a la ficha
              </button>
            </div>
          )}
          <dl className="student-account-fields">
            <div>
              <dt>País</dt>
              <dd>{countryLabel(portal.country) || '—'}</dd>
            </div>
            <div>
              <dt>Zona horaria</dt>
              <dd>{portal.time_zone ? zoneLabel(portal.time_zone) : '—'}</dd>
            </div>
            {portal.discord && (
              <div>
                <dt>Discord</dt>
                <dd>{portal.discord}</dd>
              </div>
            )}
            {birthdayText(portal.birthday) && (
              <div>
                <dt>Cumpleaños</dt>
                <dd>{birthdayText(portal.birthday)}</dd>
              </div>
            )}
          </dl>
          <p className="student-muted">Disponibilidad en su hora local ({zoneLabel(portal.time_zone)}):</p>
          <AvailabilityGrid hours={hours} />
        </>
      )}
    </section>
  )
}

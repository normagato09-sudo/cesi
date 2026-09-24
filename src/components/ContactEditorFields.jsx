import TimeZoneSelect from './TimeZoneSelect.jsx'
import WeeklyScheduleEditor from './WeeklyScheduleEditor.jsx'
import PhotoField from './PhotoField.jsx'
import { zonePlace } from '../lib/timezones'
import './EventFormModal.css'
import './GroupsModal.css'

/**
 * Campos de los datos de un contacto (sobre un borrador de useContactDraft).
 * `skip`: campos que no se muestran, p. ej. en el perfil de equipo la organización y el cargo
 * del contacto (allí el cargo es el del equipo).
 */
export default function ContactEditorFields({ draft, skip = [], autoFocusName = false }) {
  const { values: v, set, seed, groups } = draft
  const show = (field) => !skip.includes(field)

  return (
    <>
      <PhotoField name={v.name} value={v.photo} onChange={draft.handlePhoto} />

      <label className="event-form-field">
        <span>Nombre</span>
        <input type="text" value={v.name} onChange={(e) => set.setName(e.target.value)} placeholder="Nombre y apellidos" autoFocus={autoFocusName} />
      </label>

      <div className="event-form-row">
        <label className="event-form-field">
          <span>Email (opcional)</span>
          <input type="email" value={v.email} onChange={(e) => set.setEmail(e.target.value)} placeholder="ana@empresa.com" />
        </label>
        <label className="event-form-field">
          <span>Teléfono (opcional)</span>
          <input type="tel" value={v.phone} onChange={(e) => set.setPhone(e.target.value)} placeholder="+34 600 000 000" />
        </label>
      </div>

      {(show('organization') || show('role')) && (
        <div className="event-form-row">
          {show('organization') && (
            <label className="event-form-field">
              <span>Organización (opcional)</span>
              <input type="text" value={v.organization} onChange={(e) => set.setOrganization(e.target.value)} placeholder="Empresa" />
            </label>
          )}
          {show('role') && (
            <label className="event-form-field">
              <span>Cargo (opcional)</span>
              <input type="text" value={v.role} onChange={(e) => set.setRole(e.target.value)} placeholder="Directora comercial" />
            </label>
          )}
        </div>
      )}

      <div className="event-form-field">
        <TimeZoneSelect label="País" value={v.zone} onChange={set.setZone} requireZoneChoice />
        {seed.countryUnreviewed && (
          <p className="contact-form-hint warn">
            País sin revisar: se le asignó España automáticamente. Comprueba que es correcto y guarda.
          </p>
        )}
      </div>

      <div className="event-form-field">
        <span id="contact-form-groups">Grupos (opcional)</span>
        {groups.length === 0 ? (
          <p className="contact-form-hint">Crea grupos desde el botón «Grupos» de Contactos para organizar a tus contactos.</p>
        ) : (
          <div className="group-chips" role="group" aria-labelledby="contact-form-groups">
            {groups.map((g) => {
              const on = v.groupIds.includes(g.id)
              return (
                <button
                  key={g.id}
                  type="button"
                  className={`group-chip${on ? ' on' : ''}`}
                  style={{ '--group-color': g.color }}
                  aria-pressed={on}
                  onClick={() => draft.toggleGroup(g.id)}
                >
                  {g.name}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="contact-form-availability">
        <label className="event-form-checkbox">
          <input type="checkbox" checked={v.hasAvailability} onChange={(e) => set.setHasAvailability(e.target.checked)} />
          <span>Disponibilidad habitual (opcional)</span>
        </label>
        {v.hasAvailability && (
          <>
            <p className="contact-form-hint">
              Franjas en las que suele poder reunirse, en {v.zone?.timeZone ? `hora de ${zonePlace(v.zone.timeZone)}` : 'hora de España'}.
              "Buscar hueco" solo propone horas que le vengan bien.
            </p>
            <WeeklyScheduleEditor value={v.availability} onChange={set.setAvailability} />
          </>
        )}
      </div>

      <label className="event-form-field">
        <span>Notas (opcional)</span>
        <textarea value={v.notes} onChange={(e) => set.setNotes(e.target.value)} rows={3} placeholder="Información útil sobre este contacto..." />
      </label>
    </>
  )
}

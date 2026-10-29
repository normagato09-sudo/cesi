import { useMemo, useState } from 'react'
import { Copy, Eraser, X } from 'lucide-react'
import AvailabilityGrid from './AvailabilityGrid.jsx'
import {
  MONTHS,
  copyMondayToWeekdays,
  countryZones,
  daysInMonth,
  detectedZone,
  emptyHours,
  formFromProfile,
  profileRowFromForm,
  sortedCountries,
  totalHours,
  validatePortalForm,
} from '../lib/studentPortal'
import { countryFlag, zoneLabel } from '../lib/timezones'

const COUNTRY_OPTIONS = sortedCountries()

// «Completa tu perfil» (la primera vez, obligatorio) o «Editar mi perfil» (desde Mi panel, ya
// relleno). onSave(fila de student_profiles) guarda; si falla, lanza un error con el mensaje.
export default function StudentProfileForm({ profile, account, required, onSave, onCancel }) {
  const detected = useMemo(() => detectedZone(), [])
  const [form, setForm] = useState(() => formFromProfile(profile, account, detected))
  const [tried, setTried] = useState(false) // tras pulsar Guardar se marcan los errores
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const errors = useMemo(() => (tried ? validatePortalForm(form) : {}), [tried, form])

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const setHours = (update) => setForm((f) => ({ ...f, hours: update(f.hours) }))
  const zones = countryZones(form.country)
  const hours = totalHours(form.hours)
  const fromDiscord = account?.auth_provider === 'discord' && !!account?.discord_username && form.discord === account.discord_username

  const handleCountry = (country) => {
    const options = countryZones(country)
    const timeZone = options.some((z) => z.id === form.timeZone)
      ? form.timeZone
      : options.some((z) => z.id === detected.timeZone)
        ? detected.timeZone
        : options.length === 1
          ? options[0].id
          : ''
    set({ country, timeZone })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setTried(true)
    if (Object.keys(validatePortalForm(form)).length > 0) {
      // Al primer campo marcado en rojo (tras pintar los errores).
      requestAnimationFrame(() => {
        document.querySelector('.sp-field.invalid, .sp-hours-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      await onSave(profileRowFromForm(form))
    } catch (err) {
      setSaveError(err?.message || 'No se pudo guardar. Inténtalo de nuevo.')
      setSaving(false)
    }
  }

  const fieldClass = (name) => `sp-field${errors[name] ? ' invalid' : ''}`
  const zoneName = form.timeZone ? zoneLabel(form.timeZone) : 'elige tu zona horaria'

  return (
    <form className="sp-form" onSubmit={handleSubmit} noValidate>
      <header className="sp-form-head">
        {required ? (
          <span className="sp-badge-warning">Obligatorio antes de empezar</span>
        ) : (
          onCancel && (
            <button type="button" className="sp-icon-btn sp-form-close" onClick={onCancel} aria-label="Cerrar sin guardar">
              <X size={20} strokeWidth={1.75} />
            </button>
          )
        )}
        <h1>{required ? 'Completa tu perfil' : 'Editar mi perfil'}</h1>
        <p>Con estos datos organizamos los horarios de tus cursos. Podrás cambiarlos cuando quieras desde Mi panel.</p>
      </header>

      <section className="sp-card">
        <h2>Tus datos</h2>

        <label className={fieldClass('fullName')}>
          <span className="sp-label">
            Nombre y apellidos <span aria-hidden="true">*</span>
          </span>
          <input
            type="text"
            autoComplete="name"
            value={form.fullName}
            maxLength={120}
            required
            aria-invalid={!!errors.fullName}
            onChange={(e) => set({ fullName: e.target.value })}
          />
          {errors.fullName && <span className="sp-error">{errors.fullName}</span>}
        </label>

        <label className={fieldClass('discord')}>
          <span className="sp-label">Usuario de Discord</span>
          <input
            type="text"
            autoComplete="off"
            value={form.discord}
            maxLength={40}
            placeholder="Opcional"
            aria-invalid={!!errors.discord}
            onChange={(e) => set({ discord: e.target.value })}
          />
          {fromDiscord && <span className="sp-hint">Rellenado desde tu cuenta de Discord</span>}
          {errors.discord && <span className="sp-error">{errors.discord}</span>}
        </label>

        <div className="sp-two-cols">
          <label className={fieldClass('country')}>
            <span className="sp-label">
              País <span aria-hidden="true">*</span>
            </span>
            <select value={form.country} required aria-invalid={!!errors.country} onChange={(e) => handleCountry(e.target.value)}>
              <option value="">Elige tu país</option>
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {countryFlag(c.code)} {c.name}
                </option>
              ))}
            </select>
            {errors.country && <span className="sp-error">{errors.country}</span>}
          </label>

          <div className={fieldClass('birthday')} role="group" aria-labelledby="sp-birthday-label">
            <span className="sp-label" id="sp-birthday-label">
              Cumpleaños
            </span>
            <div className="sp-birthday">
              <select
                value={form.birthdayDay}
                aria-label="Día"
                aria-invalid={!!errors.birthday}
                onChange={(e) => set({ birthdayDay: e.target.value ? Number(e.target.value) : '' })}
              >
                <option value="">Día</option>
                {Array.from({ length: form.birthdayMonth ? daysInMonth(form.birthdayMonth) : 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <select
                value={form.birthdayMonth}
                aria-label="Mes"
                aria-invalid={!!errors.birthday}
                onChange={(e) => set({ birthdayMonth: e.target.value ? Number(e.target.value) : '' })}
              >
                <option value="">Mes</option>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            {errors.birthday && <span className="sp-error">{errors.birthday}</span>}
          </div>
        </div>

        <label className={fieldClass('timeZone')}>
          <span className="sp-label">
            Zona horaria <span aria-hidden="true">*</span>
          </span>
          <select
            value={form.timeZone}
            required
            disabled={!form.country}
            aria-invalid={!!errors.timeZone}
            onChange={(e) => set({ timeZone: e.target.value })}
          >
            <option value="">{form.country ? 'Elige tu zona horaria' : 'Elige antes tu país'}</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label} ({z.id}){z.id === detected.timeZone ? ' (detectada)' : ''}
              </option>
            ))}
          </select>
          {errors.timeZone && <span className="sp-error">{errors.timeZone}</span>}
        </label>

        <div className="sp-field">
          <span className="sp-label">Correo</span>
          <p className="sp-readonly">{account?.email || '—'}</p>
        </div>
      </section>

      <section className="sp-card">
        <h2>
          Tu disponibilidad <span aria-hidden="true">*</span>
        </h2>
        <p className="sp-text" id="sp-hours-help">
          Marca cada hora en la que puedes tener clase, día por día. Siempre en tu hora local ({zoneName}).
        </p>
        <div className="sp-actions-row">
          <button type="button" className="sp-btn-secondary" onClick={() => setHours(copyMondayToWeekdays)}>
            <Copy size={16} strokeWidth={1.75} />
            Copiar lunes a L–V
          </button>
          <button type="button" className="sp-btn-secondary" onClick={() => setHours(() => emptyHours())}>
            <Eraser size={16} strokeWidth={1.75} />
            Borrar todo
          </button>
        </div>
        <AvailabilityGrid
          hours={form.hours}
          onChange={setHours}
          invalid={!!errors.hours}
          describedBy="sp-hours-help"
        />
        <div className="avail-legend" aria-hidden="true">
          <span>
            <i className="on" /> Disponible
          </span>
          <span>
            <i /> No disponible
          </span>
        </div>
        {hours > 0 ? (
          <p className="sp-hours-total">
            {hours} {hours === 1 ? 'hora disponible' : 'horas disponibles'} a la semana
          </p>
        ) : (
          <p className={errors.hours ? 'sp-error sp-hours-error' : 'sp-text'}>Marca al menos una hora para continuar</p>
        )}
      </section>

      {saveError && (
        <p className="sp-save-error" role="alert">
          {saveError}
        </p>
      )}
      {tried && Object.keys(errors).length > 0 && (
        <p className="sp-save-error" role="alert">
          Revisa los campos marcados en rojo.
        </p>
      )}

      <div className="sp-submit-row">
        {!required && onCancel && (
          <button type="button" className="sp-btn-secondary" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
        )}
        <button type="submit" className="sp-btn-primary" disabled={saving}>
          {saving ? 'Guardando…' : required ? 'Guardar y entrar' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  )
}

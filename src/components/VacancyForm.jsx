import { useState } from 'react'
import { Briefcase, X } from 'lucide-react'
import { MAX_SEATS, TITLE_MAX, VACANCY_AREAS, VACANCY_STATUSES, dataFromForm, emptyVacancyForm, formFromVacancy, validateVacancy } from '../lib/vacancyBoard'
import './EventFormModal.css'
import './StudentsView.css'

/**
 * Crear o editar una vacante, con el mismo formulario que «Nuevo curso» / «Editar curso».
 * vacancy null: nueva. onSubmit(id | null, datos) puede devolver una promesa; si falla, el error
 * sale en el formulario. onDelete(vacante): «Borrar vacante» (solo al editar).
 */
export default function VacancyForm({ vacancy = null, onClose, onSubmit, onDelete = null }) {
  const [form, setForm] = useState(() => (vacancy ? formFromVacancy(vacancy) : emptyVacancyForm()))
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    const problem = validateVacancy(form)
    if (problem) {
      setFormError(problem)
      return
    }
    setBusy(true)
    try {
      await onSubmit(vacancy?.id || null, dataFromForm(form))
      onClose()
    } catch (err) {
      setFormError(err.message || 'No se pudo guardar. Inténtalo de nuevo.')
      setBusy(false)
    }
  }

  return (
    <div className="event-form-backdrop" onClick={onClose}>
      <form className="event-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit} noValidate>
        <div className="event-form-header">
          <h2>
            <Briefcase size={17} strokeWidth={1.75} />
            {vacancy ? 'Editar vacante' : 'Nueva vacante'}
          </h2>
          <button type="button" className="event-form-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="event-form-body">
          <label className="event-form-field">
            <span>Título</span>
            <input type="text" maxLength={TITLE_MAX} value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Ej.: Profesor de Office" autoFocus />
          </label>

          <div className="event-form-row">
            <label className="event-form-field">
              <span>Área</span>
              <select value={form.area} onChange={(e) => set({ area: e.target.value })}>
                <option value="">Elige…</option>
                {VACANCY_AREAS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label className="event-form-field">
              <span>Estado</span>
              <select value={form.status} onChange={(e) => set({ status: e.target.value })}>
                {VACANCY_STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="event-form-row">
            <label className="event-form-field">
              <span>Plazas</span>
              <input type="number" min={1} max={MAX_SEATS} value={form.seats} onChange={(e) => set({ seats: e.target.value })} placeholder="Ej.: 2" />
            </label>
            <label className="event-form-field">
              <span>Horas por semana</span>
              <input type="text" maxLength={40} value={form.hoursPerWeek} onChange={(e) => set({ hoursPerWeek: e.target.value })} placeholder="Ej.: 3-5 h" />
            </label>
          </div>

          <div className="event-form-row">
            <label className="event-form-field">
              <span>Fecha de publicación</span>
              <input type="date" value={form.openedAt} onChange={(e) => set({ openedAt: e.target.value })} />
            </label>
            <label className="event-form-field">
              <span>Fecha de cierre (opcional)</span>
              <input type="date" value={form.closesAt} min={form.openedAt || undefined} onChange={(e) => set({ closesAt: e.target.value })} />
            </label>
          </div>

          <label className="event-form-field">
            <span>Descripción (opcional)</span>
            <textarea value={form.description} maxLength={4000} onChange={(e) => set({ description: e.target.value })} rows={3} placeholder="Qué hará la persona…" />
          </label>

          <label className="event-form-field">
            <span>Requisitos (opcional)</span>
            <textarea value={form.requirements} maxLength={4000} onChange={(e) => set({ requirements: e.target.value })} rows={2} placeholder="Qué necesita saber o tener…" />
          </label>

          <label className="event-form-field">
            <span>Notas internas (opcional)</span>
            <textarea value={form.internalNotes} maxLength={4000} onChange={(e) => set({ internalNotes: e.target.value })} rows={2} placeholder="Solo las ven la dirección, Directivo y RRHH" />
          </label>

          {formError && <div className="event-form-error">{formError}</div>}
        </div>

        <div className="event-form-footer">
          {vacancy && onDelete && (
            <button type="button" className="event-form-delete" onClick={() => onDelete(vacancy)} disabled={busy}>
              Borrar vacante
            </button>
          )}
          <button type="button" className="event-form-cancel" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="event-form-submit" disabled={busy}>
            {vacancy ? 'Guardar' : 'Crear vacante'}
          </button>
        </div>
      </form>
    </div>
  )
}

import { useState } from 'react'
import { X, UserPlus, UserPen } from 'lucide-react'
import { isEmail } from '../lib/contacts'
import './EventFormModal.css'

export default function ContactFormModal({ initialContact, onClose, onSubmit }) {
  const isEditing = !!initialContact
  const seed = initialContact || {}

  const [name, setName] = useState(seed.name || '')
  const [email, setEmail] = useState(seed.email || '')
  const [phone, setPhone] = useState(seed.phone || '')
  const [organization, setOrganization] = useState(seed.organization || '')
  const [role, setRole] = useState(seed.role || '')
  const [notes, setNotes] = useState(seed.notes || '')
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError(null)

    if (!name.trim()) {
      setFormError('El nombre es obligatorio.')
      return
    }
    if (email.trim() && !isEmail(email)) {
      setFormError('El email no tiene un formato válido.')
      return
    }

    setSubmitting(true)
    try {
      await onSubmit({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        organization: organization.trim(),
        role: role.trim(),
        notes: notes.trim(),
      })
      onClose()
    } catch (err) {
      setFormError(err.message || 'No se pudo guardar. Inténtalo de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="event-form-backdrop" onClick={onClose}>
      <form className="event-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit} noValidate>
        <div className="event-form-header">
          <h2>
            {isEditing ? <UserPen size={17} strokeWidth={1.75} /> : <UserPlus size={17} strokeWidth={1.75} />}
            {isEditing ? 'Editar contacto' : 'Nuevo contacto'}
          </h2>
          <button type="button" className="event-form-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="event-form-body">
          <label className="event-form-field">
            <span>Nombre</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellidos" autoFocus />
          </label>

          <div className="event-form-row">
            <label className="event-form-field">
              <span>Email (opcional)</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ana@empresa.com" />
            </label>
            <label className="event-form-field">
              <span>Teléfono (opcional)</span>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+34 600 000 000" />
            </label>
          </div>

          <div className="event-form-row">
            <label className="event-form-field">
              <span>Organización (opcional)</span>
              <input type="text" value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="Empresa" />
            </label>
            <label className="event-form-field">
              <span>Cargo (opcional)</span>
              <input type="text" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Directora comercial" />
            </label>
          </div>

          <label className="event-form-field">
            <span>Notas (opcional)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Información útil sobre este contacto..." />
          </label>

          {formError && <div className="event-form-error">{formError}</div>}
        </div>

        <div className="event-form-footer">
          <button type="button" className="event-form-cancel" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="event-form-submit" disabled={submitting}>
            {submitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear contacto'}
          </button>
        </div>
      </form>
    </div>
  )
}

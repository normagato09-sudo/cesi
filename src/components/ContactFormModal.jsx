import { useRef, useState } from 'react'
import { X, UserPlus, UserPen } from 'lucide-react'
import ContactEditorFields from './ContactEditorFields.jsx'
import { useContactDraft } from '../hooks/useContactDraft'
import './EventFormModal.css'
import './GroupsModal.css'

export default function ContactFormModal({ initialContact, groups = [], onClose: close, onSubmit }) {
  const isEditing = !!initialContact
  const draft = useContactDraft(initialContact, groups)
  const savedRef = useRef(false)
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const onClose = () => {
    if (!savedRef.current) draft.discardFiles()
    close()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError(null)
    const problem = draft.validate()
    if (problem) {
      setFormError(problem)
      return
    }

    setSubmitting(true)
    try {
      await onSubmit(draft.toContactData())
      savedRef.current = true
      draft.commitFiles()
      onClose()
    } catch (err) {
      setFormError(err.message || 'No se pudo guardar. Inténtalo de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="event-form-backdrop" onClick={onClose}>
      <form className="event-form contact-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit} noValidate>
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
          <ContactEditorFields draft={draft} autoFocusName />
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

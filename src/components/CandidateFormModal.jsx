import { useRef, useState } from 'react'
import { FileUp, Trash2, UserPlus, UserPen, X } from 'lucide-react'
import TimeZoneSelect from './TimeZoneSelect.jsx'
import CvLink from './CvLink.jsx'
import { deleteFile, sameFile, saveFile } from '../lib/files/files'
import { checkCvFile } from '../lib/files/image'
import { isEmail, validateContactCountry } from '../lib/contacts'
import { defaultContactZone, zoneValue } from '../lib/timezones'
import { newCandidacy } from '../lib/vacancies'
import { todayKey } from '../lib/team'
import './EventFormModal.css'
import './PhotoField.css'
import './VacanciesView.css'

/**
 * Candidato de una vacante: es un contacto (con país obligatorio) con `candidacy`.
 * onSubmit(contactData) recibe los datos del contacto, con la candidatura incluida.
 */
export default function CandidateFormModal({ vacancy, initialContact = null, onSubmit, onClose: close }) {
  const seed = initialContact || {}
  const candidacy = seed.candidacy || null
  const [name, setName] = useState(seed.name || '')
  const [email, setEmail] = useState(seed.email || '')
  const [phone, setPhone] = useState(seed.phone || '')
  const [zone, setZone] = useState(() => zoneValue(seed.timeZone, seed.country) || defaultContactZone())
  const [appliedAt, setAppliedAt] = useState(candidacy?.appliedAt || todayKey())
  const [notes, setNotes] = useState(seed.notes || '')
  // CV: archivo PDF guardado o enlace.
  const initialCv = candidacy?.cv || null
  const [cvMode, setCvMode] = useState(initialCv?.url ? 'link' : 'file')
  const [cvFile, setCvFile] = useState(initialCv && !initialCv.url ? initialCv : null)
  const [cvUrl, setCvUrl] = useState(initialCv?.url || '')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)
  const uploadedRef = useRef([])
  const savedRef = useRef(false)

  const onClose = () => {
    if (!savedRef.current) for (const ref of uploadedRef.current) deleteFile(ref)
    close()
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const problem = checkCvFile(file)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setUploading(true)
    try {
      const blob = file.type === 'application/pdf' ? file : new Blob([file], { type: 'application/pdf' })
      const ref = await saveFile(blob, { folder: 'cvs', ext: 'pdf', name: file.name })
      uploadedRef.current.push(ref)
      setCvFile(ref)
    } catch (err) {
      setError(err.message || 'No se pudo guardar el CV.')
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError('El nombre es obligatorio.')
    if (email.trim() && !isEmail(email)) return setError('El email no tiene un formato válido.')
    const countryProblem = validateContactCountry(zone || {})
    if (countryProblem) return setError(countryProblem)
    if (!appliedAt) return setError('Indica la fecha de candidatura.')

    const cv = cvMode === 'link' ? (cvUrl.trim() ? { url: cvUrl.trim() } : null) : cvFile
    const base = candidacy || newCandidacy(vacancy.id, { appliedAt })
    savedRef.current = true
    // El CV anterior (si se ha cambiado o quitado) y los subidos descartados ya no se usan.
    if (initialCv?.store && !sameFile(initialCv, cv)) deleteFile(initialCv)
    for (const ref of uploadedRef.current) if (!sameFile(ref, cv)) deleteFile(ref)
    onSubmit({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      notes: notes.trim(),
      country: zone.country,
      timeZone: zone.timeZone,
      countryUnreviewed: false,
      candidacy: { ...base, appliedAt, cv },
    })
    close()
  }

  return (
    <div className="event-form-backdrop" onClick={onClose}>
      <form className="event-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit} noValidate>
        <div className="event-form-header">
          <h2>
            {initialContact ? <UserPen size={17} strokeWidth={1.75} /> : <UserPlus size={17} strokeWidth={1.75} />}
            {initialContact ? 'Editar candidato' : 'Nuevo candidato'}
          </h2>
          <button type="button" className="event-form-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="event-form-body">
          <p className="candidate-form-vacancy">Vacante: {vacancy.title}</p>

          <label className="event-form-field">
            <span>Nombre</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellidos" autoFocus />
          </label>

          <div className="event-form-row">
            <label className="event-form-field">
              <span>Email (opcional)</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ana@ejemplo.com" />
            </label>
            <label className="event-form-field">
              <span>Teléfono (opcional)</span>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+34 600 000 000" />
            </label>
          </div>

          <div className="event-form-field">
            <TimeZoneSelect label="País" value={zone} onChange={setZone} requireZoneChoice />
          </div>

          <label className="event-form-field">
            <span>Fecha de candidatura</span>
            <input type="date" value={appliedAt} onChange={(e) => setAppliedAt(e.target.value)} />
          </label>

          <div className="event-form-field">
            <span>CV (opcional)</span>
            <div className="view-switch candidate-cv-switch" role="group" aria-label="Tipo de CV">
              <button type="button" className={`view-switch-btn ${cvMode === 'file' ? 'active' : ''}`} onClick={() => setCvMode('file')}>
                Archivo PDF
              </button>
              <button type="button" className={`view-switch-btn ${cvMode === 'link' ? 'active' : ''}`} onClick={() => setCvMode('link')}>
                Enlace
              </button>
            </div>
            {cvMode === 'file' ? (
              <div className="candidate-cv-file">
                {cvFile ? (
                  <>
                    <CvLink cv={cvFile} className="photo-field-btn" />
                    <button type="button" className="photo-field-btn subtle" onClick={() => setCvFile(null)}>
                      <Trash2 size={14} strokeWidth={1.75} />
                      Quitar
                    </button>
                  </>
                ) : (
                  <button type="button" className="photo-field-btn" onClick={() => inputRef.current?.click()} disabled={uploading}>
                    <FileUp size={14} strokeWidth={1.75} />
                    {uploading ? 'Guardando…' : 'Subir PDF (hasta 5 MB)'}
                  </button>
                )}
                <input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={handleFile} hidden />
              </div>
            ) : (
              <input type="url" value={cvUrl} onChange={(e) => setCvUrl(e.target.value)} placeholder="https://drive.google.com/…" aria-label="Enlace al CV" />
            )}
          </div>

          <label className="event-form-field">
            <span>Notas (opcional)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Impresiones, disponibilidad, pretensiones…" />
          </label>

          {error && <div className="event-form-error">{error}</div>}
        </div>

        <div className="event-form-footer">
          <button type="button" className="event-form-cancel" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="event-form-submit" disabled={uploading}>
            {initialContact ? 'Guardar cambios' : 'Añadir candidato'}
          </button>
        </div>
      </form>
    </div>
  )
}

import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, FileUp, Search, Trash2, UserPlus, UserPen, UsersRound, X } from 'lucide-react'
import TimeZoneSelect from './TimeZoneSelect.jsx'
import ContactAvatar from './ContactAvatar.jsx'
import CvLink from './CvLink.jsx'
import { deleteFile, sameFile, saveFile } from '../lib/files/files'
import { checkCvFile } from '../lib/files/image'
import { isEmail, validateContactCountry } from '../lib/contacts'
import { defaultContactZone, zoneValue } from '../lib/timezones'
import { candidaciesOf, isCandidateOnly } from '../lib/vacancies'
import { findDuplicates, knownPersonText, searchContacts } from '../lib/applications'
import { todayKey } from '../lib/team'
import './EventFormModal.css'
import './PhotoField.css'
import './VacanciesView.css'

const MAX_RESULTS = 8

// Candidatura de ese contacto a esta vacante, o null.
function candidacyFor(contact, vacancyId) {
  return candidaciesOf(contact).find((c) => c.vacancyId === vacancyId) || null
}

// "ana@ejemplo.com · Ya es del equipo"
function contactHint(contact) {
  return [contact.email, knownPersonText(contact)].filter(Boolean).join(' · ')
}

/**
 * Candidatura a una vacante. Una persona es un solo contacto, que puede tener varias candidaturas.
 * Al añadir: se elige un contacto que ya existe (con buscador) o se escribe una persona nueva; si
 * su nombre o su email ya están en Contactos, se avisa para no crear un perfil duplicado.
 * `initial`: { contact, candidacy } para editar una candidatura.
 * onSubmit({ contactId, contactData, candidacy }):
 *   contactId: el contacto elegido o editado (null = persona nueva; con el mismo email que un
 *              contacto, la candidatura se añade a ese contacto);
 *   contactData: datos del contacto (null si no se cambian);
 *   candidacy: { appliedAt, cv, notes }.
 * onOpenCandidacy(id): abrir la candidatura que esa persona ya tiene en esta vacante.
 */
export default function CandidateFormModal({ vacancy, contacts = [], initial = null, onSubmit, onOpenCandidacy, onClose: close }) {
  const editing = !!initial
  const candidacy = initial?.candidacy || null
  const seed = initial?.contact || {}
  // Los datos de un contacto que ya era contacto o del equipo se cambian en su ficha, no aquí.
  const editContactData = !editing || isCandidateOnly(seed)
  const [mode, setMode] = useState('new') // 'new' | 'existing' (solo al añadir)
  const [query, setQuery] = useState('')
  const [chosenId, setChosenId] = useState(null)
  const [name, setName] = useState(seed.name || '')
  const [email, setEmail] = useState(seed.email || '')
  const [phone, setPhone] = useState(seed.phone || '')
  const [zone, setZone] = useState(() => zoneValue(seed.timeZone, seed.country) || defaultContactZone())
  const [appliedAt, setAppliedAt] = useState(candidacy?.appliedAt || todayKey())
  const [notes, setNotes] = useState(candidacy?.notes || '')
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

  const chosen = contacts.find((c) => c.id === chosenId) || null
  const results = useMemo(() => (mode === 'existing' && !chosen ? searchContacts(contacts, query) : []), [mode, chosen, contacts, query])
  // Posibles duplicados de la persona nueva (sin contar la que se está editando).
  const duplicates = useMemo(
    () => (editContactData ? findDuplicates(contacts, { name, email }).filter((d) => d.contact.id !== seed.id) : []),
    [editContactData, contacts, name, email, seed.id],
  )
  const emailMatch = !editing && mode === 'new' ? duplicates.find((d) => d.by === 'email')?.contact || null : null
  // La persona a la que iría la candidatura, si ya existe.
  const target = editing ? null : mode === 'existing' ? chosen : emailMatch
  const alreadyApplied = target ? candidacyFor(target, vacancy.id) : null

  const onClose = () => {
    if (!savedRef.current) for (const ref of uploadedRef.current) deleteFile(ref)
    close()
  }

  const chooseContact = (contact) => {
    setMode('existing')
    setChosenId(contact.id)
    setError(null)
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
    const existing = !editing && mode === 'existing'
    if (existing && !chosen) return setError('Busca y elige el contacto.')
    if (alreadyApplied) return setError(`${target.name} ya es candidato a esta vacante: abre su candidatura para cambiarla.`)
    let contactData = null
    if (!existing && editContactData) {
      if (!name.trim()) return setError('El nombre es obligatorio.')
      if (email.trim() && !isEmail(email)) return setError('El email no tiene un formato válido.')
      const countryProblem = validateContactCountry(zone || {})
      if (countryProblem) return setError(countryProblem)
      contactData = {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        country: zone.country,
        timeZone: zone.timeZone,
        countryUnreviewed: false,
      }
    }
    if (!appliedAt) return setError('Indica la fecha de candidatura.')
    // Mismo nombre (sin mismo email): puede ser otra persona, pero se pregunta antes de crearla.
    const sameName = !editing && !existing && !emailMatch ? duplicates.filter((d) => d.by === 'name') : []
    if (sameName.length > 0) {
      const who = sameName.map((d) => `• ${d.contact.name}${contactHint(d.contact) ? ` (${contactHint(d.contact)})` : ''}`).join('\n')
      const question = `Ya hay ${sameName.length === 1 ? 'un contacto' : 'contactos'} con ese nombre:\n${who}\n\n¿Es otra persona? Si es la misma, cancela y pulsa «Usar este contacto».`
      if (!window.confirm(question)) return
    }

    const cv = cvMode === 'link' ? (cvUrl.trim() ? { url: cvUrl.trim() } : null) : cvFile
    savedRef.current = true
    // El CV anterior (si se ha cambiado o quitado) y los subidos descartados ya no se usan.
    if (initialCv?.store && !sameFile(initialCv, cv)) deleteFile(initialCv)
    for (const ref of uploadedRef.current) if (!sameFile(ref, cv)) deleteFile(ref)
    onSubmit({
      contactId: editing ? seed.id : existing ? chosen.id : emailMatch?.id || null,
      contactData,
      candidacy: { appliedAt, cv, notes: notes.trim() },
    })
    close()
  }

  const alreadyAppliedNotice = alreadyApplied && (
    <div className="candidate-duplicates" role="status">
      <AlertTriangle size={15} strokeWidth={1.75} />
      <div>
        <p>
          <strong>{target.name}</strong> ya es candidato a esta vacante.
        </p>
        {onOpenCandidacy && (
          <button
            type="button"
            className="contact-action-btn"
            onClick={() => {
              onOpenCandidacy(alreadyApplied.id)
              onClose()
            }}
          >
            Abrir su candidatura
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="event-form-backdrop" onClick={onClose}>
      <form className="event-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit} noValidate>
        <div className="event-form-header">
          <h2>
            {editing ? <UserPen size={17} strokeWidth={1.75} /> : <UserPlus size={17} strokeWidth={1.75} />}
            {editing ? 'Editar candidatura' : 'Nuevo candidato'}
          </h2>
          <button type="button" className="event-form-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="event-form-body">
          <p className="candidate-form-vacancy">Vacante: {vacancy.title}</p>

          {!editing && (
            <div className="view-switch candidate-mode-switch" role="group" aria-label="¿Quién se presenta?">
              <button type="button" className={`view-switch-btn ${mode === 'existing' ? 'active' : ''}`} onClick={() => setMode('existing')}>
                <UsersRound size={14} strokeWidth={1.75} />
                Contacto existente
              </button>
              <button
                type="button"
                className={`view-switch-btn ${mode === 'new' ? 'active' : ''}`}
                onClick={() => {
                  setMode('new')
                  setChosenId(null)
                }}
              >
                <UserPlus size={14} strokeWidth={1.75} />
                Persona nueva
              </button>
            </div>
          )}

          {!editing && mode === 'existing' && (
            <div className="event-form-field">
              {chosen ? (
                <div className="candidate-chosen">
                  <ContactAvatar name={chosen.name} photo={chosen.photo} size="sm" />
                  <span className="candidate-chosen-text">
                    <span className="candidate-chosen-name">{chosen.name}</span>
                    {contactHint(chosen) && <span className="candidate-chosen-hint">{contactHint(chosen)}</span>}
                  </span>
                  <button type="button" className="photo-field-btn subtle" onClick={() => setChosenId(null)}>
                    Cambiar
                  </button>
                </div>
              ) : (
                <>
                  <label className="contacts-search candidate-search">
                    <Search size={15} strokeWidth={1.75} />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Buscar por nombre, email o teléfono"
                      aria-label="Buscar contacto"
                      autoFocus
                    />
                  </label>
                  {query.trim() && (
                    <ul className="candidate-results">
                      {results.length === 0 ? (
                        <li className="candidate-results-empty">
                          Nadie coincide.{' '}
                          <button
                            type="button"
                            onClick={() => {
                              setMode('new')
                              setName(query.trim())
                            }}
                          >
                            Añadirlo como persona nueva
                          </button>
                        </li>
                      ) : (
                        results.slice(0, MAX_RESULTS).map((c) => (
                          <li key={c.id}>
                            <button type="button" className="candidate-result" onClick={() => chooseContact(c)}>
                              <ContactAvatar name={c.name} photo={c.photo} size="sm" />
                              <span className="candidate-chosen-text">
                                <span className="candidate-chosen-name">{c.name}</span>
                                {contactHint(c) && <span className="candidate-chosen-hint">{contactHint(c)}</span>}
                              </span>
                              {candidacyFor(c, vacancy.id) && <span className="candidate-result-tag">Ya es candidato aquí</span>}
                            </button>
                          </li>
                        ))
                      )}
                      {results.length > MAX_RESULTS && (
                        <li className="candidate-results-empty">Y {results.length - MAX_RESULTS} más: escribe algo más para afinar.</li>
                      )}
                    </ul>
                  )}
                </>
              )}
              {alreadyAppliedNotice}
            </div>
          )}

          {editing && !editContactData && (
            <p className="team-fieldset-hint">
              {seed.name}: {knownPersonText(seed)}. Sus datos de contacto se cambian en su ficha.
            </p>
          )}

          {(editing || mode === 'new') && editContactData && (
            <>
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

              {duplicates.length > 0 && !alreadyApplied && (
                <div className="candidate-duplicates" role="status">
                  <AlertTriangle size={15} strokeWidth={1.75} />
                  <div>
                    <p>
                      <strong>{duplicates.length === 1 ? 'Ya existe un contacto parecido' : 'Ya existen contactos parecidos'}</strong>
                      {editing ? '.' : ': si es la misma persona, usa su contacto para no duplicarla.'}
                    </p>
                    <ul>
                      {duplicates.map(({ contact, by }) => (
                        <li key={contact.id}>
                          <span>
                            {contact.name} ({by === 'email' ? 'mismo email' : 'mismo nombre'}
                            {knownPersonText(contact) ? ` · ${knownPersonText(contact)}` : ''})
                          </span>
                          {!editing && (
                            <button type="button" className="contact-action-btn" onClick={() => chooseContact(contact)}>
                              Usar este contacto
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                    {emailMatch && <p>Si continúas así, la candidatura se añadirá a {emailMatch.name}, que tiene ese email.</p>}
                  </div>
                </div>
              )}
              {!editing && alreadyAppliedNotice}

              <div className="event-form-field">
                <TimeZoneSelect label="País" value={zone} onChange={setZone} requireZoneChoice />
              </div>
            </>
          )}

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
            <span>Notas de esta candidatura (opcional)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Impresiones, disponibilidad, pretensiones…" />
          </label>

          {error && <div className="event-form-error">{error}</div>}
        </div>

        <div className="event-form-footer">
          <button type="button" className="event-form-cancel" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="event-form-submit" disabled={uploading || !!alreadyApplied}>
            {editing ? 'Guardar cambios' : 'Añadir candidatura'}
          </button>
        </div>
      </form>
    </div>
  )
}

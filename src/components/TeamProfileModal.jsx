import { useRef, useState } from 'react'
import { BadgeCheck, Plus, X } from 'lucide-react'
import ContactEditorFields from './ContactEditorFields.jsx'
import LinksEditor from './LinksEditor.jsx'
import { useContactDraft } from '../hooks/useContactDraft'
import { QUOTE_MAX_LENGTH, emptyTeamProfile, milestonesToBio, normalizeQuote, teamProfileDefaults, todayKey, validateQuote } from '../lib/team'
import { cleanLinks, migrateProfileLinks, validateUrl } from '../lib/links'
import { departmentKey } from '../lib/departments'
import './EventFormModal.css'
import './TeamProfileModal.css'

const NEW_AREA = '__new__'

/**
 * Perfil de equipo de un contacto. Arriba, los datos del contacto (ya rellenados y editables aquí
 * mismo; se guardan en el contacto, una sola vez). Debajo, lo propio del equipo: cargo,
 * departamento, incorporación, estado, trayectoria (texto libre) y enlaces. onSave({ contactPatch, teamProfile }).
 * `initialProfile` permite abrirlo ya rellenado (p. ej. al incorporar a un candidato); si no hay
 * perfil, se parte del cargo del contacto, hoy como incorporación y sus enlaces.
 */
export default function TeamProfileModal({
  contact,
  areas,
  groups = [],
  initialProfile = null,
  title,
  saveLabel = 'Guardar perfil',
  onAddArea,
  onSave,
  onClose: close,
}) {
  const seed = emptyTeamProfile(milestonesToBio(migrateProfileLinks(initialProfile || contact.teamProfile || teamProfileDefaults(contact))))
  const draft = useContactDraft(contact, groups)
  const [role, setRole] = useState(seed.role)
  const [area, setArea] = useState(seed.area)
  const [newArea, setNewArea] = useState('')
  const [addingArea, setAddingArea] = useState(false)
  const [joinedAt, setJoinedAt] = useState(seed.joinedAt || '')
  const [status, setStatus] = useState(seed.status)
  const [leftAt, setLeftAt] = useState(seed.leftAt || todayKey())
  const [bio, setBio] = useState(seed.bio)
  const [quote, setQuote] = useState(seed.quote || '')
  const [links, setLinks] = useState(seed.links || [])
  const [error, setError] = useState(null)
  const savedRef = useRef(false)

  const onClose = () => {
    if (!savedRef.current) draft.discardFiles()
    close()
  }

  const handleAreaSelect = (value) => {
    if (value === NEW_AREA) {
      setAddingArea(true)
      return
    }
    setArea(value)
  }

  const confirmNewArea = () => {
    const clean = newArea.replace(/\s+/g, ' ').trim()
    if (!clean) return
    // Si ya existe (sin distinguir mayúsculas ni acentos) se elige el existente.
    const existing = areas.find((d) => departmentKey(d) === departmentKey(clean))
    if (!existing) onAddArea(clean)
    setArea(existing || clean)
    setNewArea('')
    setAddingArea(false)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError(null)
    const contactProblem = draft.validate()
    if (contactProblem) return setError(contactProblem)
    if (!joinedAt) return setError('Indica la fecha de incorporación.')
    if (status === 'former' && !leftAt) return setError('Indica la fecha de salida.')
    if (status === 'former' && leftAt < joinedAt) return setError('La fecha de salida es anterior a la de incorporación.')
    const quoteProblem = validateQuote(quote)
    if (quoteProblem) return setError(quoteProblem)
    for (const link of links) {
      if (!link.url.trim() && !link.label.trim()) continue
      const problem = validateUrl(link.url)
      if (problem) return setError(`Enlaces: ${problem}`)
    }

    const teamProfile = {
      status,
      leftAt: status === 'former' ? leftAt : null,
      role: role.trim(),
      area,
      joinedAt,
      bio: bio.replace(/^\s*\n|\s+$/g, ''),
      quote: normalizeQuote(quote),
      links: cleanLinks(links),
      // CV de la candidatura, si se incorporó desde Vacantes.
      ...(seed.cv ? { cv: seed.cv } : {}),
    }
    savedRef.current = true
    draft.commitFiles()
    // Los enlaces que el contacto tenía guardados (al salir del equipo) vuelven al perfil.
    const contactPatch = { ...draft.toContactData(), ...(contact.links ? { links: null } : {}) }
    onSave({ contactPatch, teamProfile })
  }

  const areaOptions = area && !areas.includes(area) ? [...areas, area] : areas

  return (
    <div className="event-form-backdrop" onClick={onClose}>
      <form className="event-form team-profile-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit} noValidate>
        <div className="event-form-header">
          <h2>
            <BadgeCheck size={17} strokeWidth={1.75} />
            {title || `Perfil de equipo de ${draft.values.name || contact.name}`}
          </h2>
          <button type="button" className="event-form-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="event-form-body">
          <div className="event-form-row">
            <label className="event-form-field">
              <span>Cargo</span>
              <input type="text" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Profesora de doblaje" />
            </label>
            <label className="event-form-field">
              <span>Departamento</span>
              {addingArea ? (
                <span className="team-area-new">
                  <input
                    type="text"
                    value={newArea}
                    onChange={(e) => setNewArea(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        confirmNewArea()
                      }
                    }}
                    placeholder="Nuevo departamento"
                    autoFocus
                  />
                  <button type="button" onClick={confirmNewArea} aria-label="Añadir departamento">
                    <Plus size={15} strokeWidth={2} />
                  </button>
                  <button type="button" onClick={() => setAddingArea(false)} aria-label="Cancelar">
                    <X size={15} strokeWidth={2} />
                  </button>
                </span>
              ) : (
                <select value={area} onChange={(e) => handleAreaSelect(e.target.value)}>
                  <option value="">Sin departamento</option>
                  {areaOptions.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                  <option value={NEW_AREA}>+ Añadir departamento…</option>
                </select>
              )}
            </label>
          </div>

          <label className="event-form-field">
            <span className="team-quote-label">
              Frase personal (opcional)
              <span className={`team-quote-count${quote.length > QUOTE_MAX_LENGTH ? ' over' : ''}`} aria-live="polite">
                {quote.length}/{QUOTE_MAX_LENGTH}
              </span>
            </span>
            <input
              type="text"
              value={quote}
              maxLength={QUOTE_MAX_LENGTH}
              onChange={(e) => setQuote(e.target.value)}
              placeholder="Si tú cambias, todo cambia"
              aria-label="Frase personal"
            />
          </label>

          <div className="event-form-row">
            <label className="event-form-field">
              <span>Fecha de incorporación</span>
              <input type="date" value={joinedAt} onChange={(e) => setJoinedAt(e.target.value)} />
            </label>
            <label className="event-form-field">
              <span>Estado</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="active">Activo</option>
                <option value="former">Antiguo miembro</option>
              </select>
            </label>
          </div>
          {status === 'former' && (
            <label className="event-form-field">
              <span>Fecha de salida</span>
              <input type="date" value={leftAt} onChange={(e) => setLeftAt(e.target.value)} />
            </label>
          )}

          <fieldset className="team-fieldset">
            <legend>Datos de contacto</legend>
            <p className="team-fieldset-hint">Son los datos del contacto: si los cambias aquí, se cambian también en Contactos.</p>
            <ContactEditorFields draft={draft} skip={['organization', 'role']} />
          </fieldset>

          <fieldset className="team-fieldset">
            <legend>Enlaces</legend>
            <LinksEditor links={links} onChange={setLinks} />
          </fieldset>

          <label className="event-form-field">
            <span>Trayectoria</span>
            <textarea
              className="team-bio-input"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={10}
              placeholder={'Formación, experiencia, lo que aporta al equipo…\nPuedes apuntar fechas importantes, una por línea: "30/07/2026 – Se incorporó como moderador".'}
            />
          </label>

          {error && <div className="event-form-error">{error}</div>}
        </div>

        <div className="event-form-footer">
          <button type="button" className="event-form-cancel" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="event-form-submit">
            {saveLabel}
          </button>
        </div>
      </form>
    </div>
  )
}

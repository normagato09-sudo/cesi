import { useRef, useState } from 'react'
import { BadgeCheck, Link2, Plus, Trash2, X } from 'lucide-react'
import ContactEditorFields from './ContactEditorFields.jsx'
import { useContactDraft } from '../hooks/useContactDraft'
import { SOCIAL_NETWORKS, emptyTeamProfile, newMilestone, sortMilestones, teamProfileDefaults, todayKey } from '../lib/team'
import { makeId } from '../lib/store'
import { departmentKey } from '../lib/departments'
import './EventFormModal.css'
import './TeamProfileModal.css'

const NEW_AREA = '__new__'

/**
 * Perfil de equipo de un contacto. Arriba, los datos del contacto (ya rellenados y editables aquí
 * mismo; se guardan en el contacto, una sola vez). Debajo, lo propio del equipo: cargo,
 * departamento, incorporación, estado, trayectoria y enlaces. onSave({ contactPatch, teamProfile }).
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
  const seed = emptyTeamProfile(initialProfile || contact.teamProfile || teamProfileDefaults(contact))
  const draft = useContactDraft(contact, groups)
  const [role, setRole] = useState(seed.role)
  const [area, setArea] = useState(seed.area)
  const [newArea, setNewArea] = useState('')
  const [addingArea, setAddingArea] = useState(false)
  const [joinedAt, setJoinedAt] = useState(seed.joinedAt || '')
  const [status, setStatus] = useState(seed.status)
  const [leftAt, setLeftAt] = useState(seed.leftAt || todayKey())
  const [bio, setBio] = useState(seed.bio)
  const [milestones, setMilestones] = useState(() => sortMilestones(seed.milestones))
  const [social, setSocial] = useState(seed.social || {})
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

  const updateMilestone = (id, patch) => setMilestones((list) => list.map((m) => (m.id === id ? { ...m, ...patch } : m)))

  const handleSubmit = (e) => {
    e.preventDefault()
    setError(null)
    const contactProblem = draft.validate()
    if (contactProblem) return setError(contactProblem)
    if (!joinedAt) return setError('Indica la fecha de incorporación.')
    if (status === 'former' && !leftAt) return setError('Indica la fecha de salida.')
    if (status === 'former' && leftAt < joinedAt) return setError('La fecha de salida es anterior a la de incorporación.')

    const teamProfile = {
      status,
      leftAt: status === 'former' ? leftAt : null,
      role: role.trim(),
      area,
      joinedAt,
      bio: bio.trim(),
      milestones: sortMilestones(milestones.filter((m) => m.text.trim()).map((m) => ({ ...m, text: m.text.trim() }))),
      social: Object.fromEntries(Object.entries(social).filter(([, v]) => v && v.trim()).map(([k, v]) => [k, v.trim()])),
      links: links.filter((l) => l.url.trim()).map((l) => ({ ...l, label: l.label.trim(), url: l.url.trim() })),
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
            <legend>Redes y enlaces</legend>
            <div className="team-social-grid">
              {SOCIAL_NETWORKS.map((n) => (
                <label key={n.key} className="event-form-field">
                  <span>{n.label}</span>
                  <input
                    type="text"
                    value={social[n.key] || ''}
                    onChange={(e) => setSocial((s) => ({ ...s, [n.key]: e.target.value }))}
                    placeholder={n.placeholder}
                  />
                </label>
              ))}
            </div>
            <div className="team-list-editor">
              <span className="team-list-label">Otras redes y enlaces</span>
              {links.map((l) => (
                <div key={l.id} className="team-list-row">
                  <input
                    type="text"
                    value={l.label}
                    onChange={(e) => setLinks((list) => list.map((x) => (x.id === l.id ? { ...x, label: e.target.value } : x)))}
                    placeholder="Nombre (p. ej. X, Behance, Portfolio)"
                    aria-label="Nombre del enlace"
                  />
                  <input
                    type="url"
                    value={l.url}
                    onChange={(e) => setLinks((list) => list.map((x) => (x.id === l.id ? { ...x, url: e.target.value } : x)))}
                    placeholder="https://…"
                    aria-label="Dirección del enlace"
                  />
                  <button type="button" onClick={() => setLinks((list) => list.filter((x) => x.id !== l.id))} aria-label="Quitar enlace">
                    <Trash2 size={14} strokeWidth={1.75} />
                  </button>
                </div>
              ))}
              <button type="button" className="team-add-btn" onClick={() => setLinks((list) => [...list, { id: makeId('link'), label: '', url: '' }])}>
                <Link2 size={14} strokeWidth={1.75} />
                Añadir enlace
              </button>
            </div>
          </fieldset>

          <label className="event-form-field">
            <span>Trayectoria</span>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} placeholder="Formación, experiencia, lo que aporta al equipo…" />
          </label>

          <div className="team-list-editor">
            <span className="team-list-label">Hitos</span>
            {milestones.map((m) => (
              <div key={m.id} className="team-list-row milestone">
                <input type="date" value={m.date} onChange={(e) => updateMilestone(m.id, { date: e.target.value })} aria-label="Fecha del hito" />
                <input
                  type="text"
                  value={m.text}
                  onChange={(e) => updateMilestone(m.id, { text: e.target.value })}
                  placeholder="Curso de locución, proyecto…"
                  aria-label="Descripción del hito"
                />
                <button type="button" onClick={() => setMilestones((list) => list.filter((x) => x.id !== m.id))} aria-label="Quitar hito">
                  <Trash2 size={14} strokeWidth={1.75} />
                </button>
              </div>
            ))}
            <button type="button" className="team-add-btn" onClick={() => setMilestones((list) => [...list, newMilestone(todayKey())])}>
              <Plus size={14} strokeWidth={1.75} />
              Añadir hito
            </button>
          </div>

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

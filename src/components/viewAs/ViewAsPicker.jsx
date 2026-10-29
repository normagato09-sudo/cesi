import { useEffect, useState } from 'react'
import { BadgeCheck, Eye, GraduationCap, Hourglass, Search, X } from 'lucide-react'
import { normalizeName } from '../../lib/applications'
import { exampleStudent, loadViewAsOptions } from './viewAsData'
import '../EventFormModal.css'
import '../ContactsView.css'
import './ViewAs.css'

const ROLE_TABS = [
  { id: 'pendiente', label: 'Pendiente', Icon: Hourglass },
  { id: 'alumno', label: 'Alumno', Icon: GraduationCap },
  { id: 'equipo', label: 'Equipo', Icon: BadgeCheck },
]

function matches(item, query) {
  const q = normalizeName(query)
  return !q || normalizeName(`${item.label} ${item.detail || ''}`).includes(q)
}

// Selector de «Ver como…»: el papel y, para alumno o equipo, a quién (o un área).
// onPick({ role, label, ...datos de esa vista }).
export default function ViewAsPicker({ client, onPick, onClose }) {
  const [tab, setTab] = useState('alumno')
  const [options, setOptions] = useState(null)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let active = true
    loadViewAsOptions(client).then(
      (next) => active && setOptions(next),
      (err) => active && setError(err?.message || 'No se pudieron leer las cuentas.'),
    )
    return () => {
      active = false
    }
  }, [client])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const students = options ? (options.students.length > 0 ? options.students : [{ ...exampleStudent(), id: 'ejemplo', detail: 'Ejemplo' }]) : []
  const members = options ? options.members.filter((m) => matches(m, query)) : []

  const item = (key, label, detail, onClick, badge = null) => (
    <li key={key}>
      <button type="button" className="view-as-option" onClick={onClick}>
        <span>
          {label}
          {badge && <span className="view-as-example">{badge}</span>}
        </span>
        {detail && <span className="view-as-muted">{detail}</span>}
      </button>
    </li>
  )

  return (
    <div className="event-form-backdrop" onClick={onClose}>
      <div className="event-form view-as-picker" role="dialog" aria-modal="true" aria-labelledby="view-as-title" onClick={(e) => e.stopPropagation()}>
        <div className="event-form-header">
          <h2 id="view-as-title">
            <Eye size={17} strokeWidth={1.75} />
            Ver como…
          </h2>
          <button type="button" className="event-form-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="event-form-body">
          <p className="view-as-muted">Solo lectura: no se guarda nada y tu papel no cambia.</p>
          <div className="view-as-tabs" role="tablist" aria-label="Papel">
            {ROLE_TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`view-as-tab${tab === id ? ' on' : ''}`}
                onClick={() => {
                  setTab(id)
                  setQuery('')
                }}
              >
                <Icon size={15} strokeWidth={1.75} />
                {label}
              </button>
            ))}
          </div>

          {tab === 'pendiente' ? (
            <div className="view-as-pending">
              <p>La pantalla de espera de una cuenta nueva que aún no tiene acceso.</p>
              <button type="button" className="event-form-submit" onClick={() => onPick({ role: 'pendiente', label: 'una cuenta pendiente' })}>
                Ver como pendiente
              </button>
            </div>
          ) : error ? (
            <p className="event-form-error">{error}</p>
          ) : !options ? (
            <p className="view-as-muted">Cargando cuentas…</p>
          ) : (
            <>
              <label className="contacts-search view-as-search">
                <Search size={14} strokeWidth={1.75} aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={tab === 'alumno' ? 'Buscar alumno' : 'Buscar persona de equipo'}
                  aria-label={tab === 'alumno' ? 'Buscar alumno' : 'Buscar persona de equipo'}
                  autoFocus
                />
              </label>

              {tab === 'alumno' && (
                <ul className="view-as-list">
                  {students
                    .filter((s) => matches(s, query))
                    .map((s) =>
                      item(
                        s.id,
                        s.label,
                        s.example ? 'Ningún alumno tiene cuenta unida todavía' : s.detail,
                        () => onPick({ role: 'alumno', label: s.example ? `${s.label} (ejemplo)` : s.label, account: s.account, profile: s.profile }),
                        s.example ? 'Ejemplo' : null,
                      ),
                    )}
                </ul>
              )}

              {tab === 'equipo' && (
                <>
                  {options.permsError && (
                    <p className="event-form-error">Falta el SQL de la parte 2: los permisos salen vacíos.</p>
                  )}
                  <h3 className="view-as-heading">Una persona</h3>
                  <ul className="view-as-list">
                    {members.length === 0 ? (
                      <li className="view-as-muted view-as-none">{query ? 'Nadie con ese nombre.' : 'Todavía no hay cuentas de equipo.'}</li>
                    ) : (
                      members.map((m) =>
                        item(m.id, m.label, m.detail, () =>
                          onPick({ role: 'equipo', label: m.label, email: m.email, name: m.name, area: m.area, levels: m.levels }),
                        ),
                      )
                    )}
                  </ul>
                  <h3 className="view-as-heading">Solo un área (con sus permisos)</h3>
                  <ul className="view-as-list">
                    {options.areas
                      .filter((a) => matches({ label: a.name }, query))
                      .map((a) =>
                        item(`area-${a.id}`, a.name, 'Área', () =>
                          onPick({ role: 'equipo', label: `el área ${a.name}`, email: 'persona@ejemplo.com', name: '', area: a.id, levels: a.levels }),
                        ),
                      )}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

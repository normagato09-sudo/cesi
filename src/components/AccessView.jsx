import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronDown, KeyRound, RefreshCw, Search } from 'lucide-react'
import { useSync } from '../lib/sync/syncContext.js'
import {
  DISPLAY_NAME_MAX,
  ROLES,
  ROLE_LABELS,
  canChangeRole,
  filterLinkOptions,
  linkOptions,
  linkPatch,
  linkedOption,
  listProfiles,
  normalizeDisplayName,
  profileErrorText,
  updateProfile,
} from '../lib/profiles'
import './ContactsView.css'
import './AccessView.css'

function createdText(iso) {
  try {
    return format(parseISO(iso), 'd MMM yyyy', { locale: es })
  } catch {
    return ''
  }
}

// Desplegable con buscador para unir la cuenta a una persona de Equipo o a un alumno.
function LinkPicker({ value, options, disabled, onChange }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !ref.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const choose = (option) => {
    setOpen(false)
    onChange(option)
  }

  const shown = filterLinkOptions(options, query)
  const label = !value ? 'Sin unir' : value.missing ? 'Ya no existe' : `${value.label} · ${value.detail}`

  return (
    <div className="access-link" ref={ref}>
      <button
        type="button"
        className={`access-link-btn${value ? '' : ' empty'}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setQuery('')
          setOpen((o) => !o)
        }}
      >
        <span>{label}</span>
        <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open && (
        <div className="access-link-menu">
          <label className="contacts-search">
            <Search size={14} strokeWidth={1.75} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en Equipo y Alumnos"
              aria-label="Buscar en Equipo y Alumnos"
              autoFocus
            />
          </label>
          <ul role="listbox" aria-label="Unir a">
            {!query && (
              <li>
                <button type="button" role="option" aria-selected={!value} className="access-link-option" onClick={() => choose(null)}>
                  Sin unir
                </button>
              </li>
            )}
            {shown.map((o) => (
              <li key={`${o.kind}:${o.id}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value?.kind === o.kind && value?.id === o.id}
                  className="access-link-option"
                  onClick={() => choose(o)}
                >
                  <span>{o.label}</span>
                  <span className="access-muted">{o.detail}</span>
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="access-muted access-link-none">No hay nadie con ese nombre.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

// Nombre de la cuenta: se guarda al salir del campo o con Enter (Escape deshace lo escrito).
function NameField({ value, disabled, onSave }) {
  const [draft, setDraft] = useState(value || '')

  const commit = () => {
    const next = normalizeDisplayName(draft)
    setDraft(next)
    if (next !== (value || '')) onSave(next)
  }

  return (
    <input
      type="text"
      className="access-name-input"
      value={draft}
      maxLength={DISPLAY_NAME_MAX}
      placeholder="Sin nombre"
      aria-label="Nombre"
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          setDraft(value || '')
        }
      }}
    />
  )
}

// Accesos: las cuentas que han entrado en la app, su papel y a quién están unidas. Solo la ceo.
export default function AccessView({ contacts = [], students = [] }) {
  const sync = useSync()
  const client = sync?.client
  const userId = sync?.userId
  const [profiles, setProfiles] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState({})
  const options = useMemo(() => linkOptions(contacts, students), [contacts, students])

  const fetchProfiles = useCallback(
    () =>
      listProfiles(client).then(
        (list) => {
          setProfiles(list)
          setError(null)
        },
        (err) => {
          setError(profileErrorText(err))
          setProfiles((current) => current || [])
        },
      ),
    [client],
  )

  useEffect(() => {
    if (client) fetchProfiles()
  }, [client, fetchProfiles])

  const load = () => {
    setError(null)
    fetchProfiles()
  }

  const save = async (profile, patch) => {
    setSaving((s) => ({ ...s, [profile.id]: true }))
    setError(null)
    try {
      const updated = await updateProfile(client, profile.id, patch)
      setProfiles((list) => list.map((p) => (p.id === updated.id ? updated : p)))
    } catch (err) {
      setError(profileErrorText(err))
    } finally {
      setSaving((s) => ({ ...s, [profile.id]: false }))
    }
  }

  return (
    <div className="access-view">
      <div className="contacts-header">
        <h1 className="contacts-title">Accesos</h1>
        <div className="access-header-row">
          <p className="access-muted">
            Las cuentas nuevas entran como pendientes. De momento solo la CEO ve la app; el resto ve un aviso de espera.
          </p>
          <button type="button" className="contacts-groups-btn" onClick={load} title="Volver a cargar">
            <RefreshCw size={14} strokeWidth={1.75} />
            Actualizar
          </button>
        </div>
      </div>

      {error && (
        <p className="access-error" role="alert">
          {error}
        </p>
      )}

      {profiles === null ? (
        <div className="contacts-empty">
          <p>Cargando cuentas…</p>
        </div>
      ) : profiles.length === 0 ? (
        !error && (
          <div className="contacts-empty">
            <KeyRound size={28} strokeWidth={1.5} />
            <p className="contacts-empty-title">Todavía no hay cuentas</p>
          </div>
        )
      ) : (
        <ul className="access-list">
          {profiles.map((p) => {
            const self = p.id === userId
            const busy = !!saving[p.id]
            const locked = !canChangeRole(p, userId)
            return (
              <li key={p.id} className="access-row">
                <div className="access-account">
                  <span className="access-email">
                    {p.email || 'Sin email'}
                    {self && <span className="access-you">Tú</span>}
                  </span>
                  <NameField
                    key={p.display_name}
                    value={p.display_name}
                    disabled={busy}
                    onSave={(display_name) => save(p, { display_name })}
                  />
                  <span className="access-muted">Desde el {createdText(p.created_at)}</span>
                </div>
                <label className="access-field">
                  <span className="access-field-label">Papel</span>
                  <select
                    value={p.role}
                    className={locked ? 'locked' : undefined}
                    disabled={busy || locked}
                    aria-describedby={locked ? `access-locked-${p.id}` : undefined}
                    title={locked ? 'No puedes cambiar tu propio papel' : undefined}
                    onChange={(e) => save(p, { role: e.target.value })}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                  {locked && (
                    <span id={`access-locked-${p.id}`} className="access-locked-note">
                      Tu papel no se puede cambiar
                    </span>
                  )}
                </label>
                <div className="access-field">
                  <span className="access-field-label">Unida a</span>
                  <LinkPicker value={linkedOption(p, options)} options={options} disabled={busy} onChange={(o) => save(p, linkPatch(o, p))} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

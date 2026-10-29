import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronDown, KeyRound, RefreshCw, RotateCcw, Search, ShieldCheck, UserPlus } from 'lucide-react'
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
  providerText,
  updateProfile,
} from '../lib/profiles'
import {
  AREAS,
  LEVELS,
  LEVEL_LABELS,
  SCREENS,
  effectivePermissions,
  listAreaPermissions,
  listAreas,
  listProfilePermissions,
  resetProfilePermissions,
  setProfilePermission,
} from '../lib/permissions'
import { listPortalsByAccount, newStudentFromPortal } from '../lib/studentPortal'
import { todayKey } from '../lib/students'
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

// Permisos de una persona de equipo: pantallas × ninguno / ver / editar. Los que se cambian
// sustituyen a los de su área; «Volver a los del área» los quita.
function PermissionsTable({ profile, permissions, overridden, busy, onChange, onReset }) {
  return (
    <div className="access-perms">
      <table>
        <thead>
          <tr>
            <th scope="col">Pantalla</th>
            {LEVELS.map((level) => (
              <th key={level} scope="col">
                {LEVEL_LABELS[level]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SCREENS.map((screen) => {
            const perm = permissions[screen.id]
            return (
              <tr key={screen.id} className={perm.overridden ? 'overridden' : undefined}>
                <th scope="row">
                  {screen.label}
                  {perm.overridden && (
                    <span className="access-perm-own" title={`En su área: ${LEVEL_LABELS[perm.areaLevel]}`}>
                      propio
                    </span>
                  )}
                </th>
                {LEVELS.map((level) => (
                  <td key={level}>
                    <input
                      type="radio"
                      name={`perm-${profile.id}-${screen.id}`}
                      checked={perm.level === level}
                      disabled={busy}
                      aria-label={`${screen.label}: ${LEVEL_LABELS[level]}`}
                      onChange={() => onChange(screen.id, level)}
                    />
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
      <button type="button" className="contacts-groups-btn" disabled={busy || !overridden} onClick={onReset}>
        <RotateCcw size={14} strokeWidth={1.75} />
        Volver a los del área
      </button>
    </div>
  )
}

// Accesos: las cuentas que han entrado en la app, su papel, a quién están unidas y, si son de
// equipo, su área y sus permisos. Solo la ceo.
export default function AccessView({ contacts = [], students = [], onCreateStudent = null }) {
  const sync = useSync()
  const client = sync?.client
  const userId = sync?.userId
  const [profiles, setProfiles] = useState(null)
  // Áreas y permisos (null: falta el SQL de la parte 2 o no se pudieron leer).
  const [perms, setPerms] = useState(null) // { areas, areaRows, overrides }
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState({})
  const [openPerms, setOpenPerms] = useState(null) // id de la cuenta con los permisos abiertos
  const [portals, setPortals] = useState(() => new Map()) // perfiles del portal de alumnos, por cuenta
  const options = useMemo(() => linkOptions(contacts, students), [contacts, students])

  const fetchAll = useCallback(
    () =>
      Promise.allSettled([
        listProfiles(client),
        listAreas(client),
        listAreaPermissions(client),
        listProfilePermissions(client),
        listPortalsByAccount(client),
      ]).then(
        ([list, areas, areaRows, overrides, portalMap]) => {
          if (portalMap.status === 'fulfilled') setPortals(portalMap.value)
          if (list.status === 'fulfilled') {
            setProfiles(list.value)
            setError(null)
          } else {
            setError(profileErrorText(list.reason))
            setProfiles((current) => current || [])
          }
          const ok = areas.status === 'fulfilled' && areaRows.status === 'fulfilled' && overrides.status === 'fulfilled'
          setPerms(
            ok ? { areas: areas.value.length > 0 ? areas.value : AREAS, areaRows: areaRows.value, overrides: overrides.value } : null,
          )
        },
      ),
    [client],
  )

  useEffect(() => {
    if (client) fetchAll()
  }, [client, fetchAll])

  const load = () => {
    setError(null)
    fetchAll()
  }

  const withSaving = async (profileId, task) => {
    setSaving((s) => ({ ...s, [profileId]: true }))
    setError(null)
    try {
      await task()
    } catch (err) {
      setError(profileErrorText(err))
    } finally {
      setSaving((s) => ({ ...s, [profileId]: false }))
    }
  }

  const save = (profile, patch) =>
    withSaving(profile.id, async () => {
      const updated = await updateProfile(client, profile.id, patch)
      setProfiles((list) => list.map((p) => (p.id === updated.id ? updated : p)))
    })

  const savePermission = (profile, screen, level) =>
    withSaving(profile.id, async () => {
      const row = await setProfilePermission(client, profile.id, screen, level)
      setPerms((p) => ({
        ...p,
        overrides: [...p.overrides.filter((o) => !(o.profile_id === profile.id && o.screen === screen)), row],
      }))
    })

  // Ficha nueva en Alumnos con los datos de su perfil (ya con país, zona y disponibilidad) y la
  // cuenta unida a ella.
  const createStudentFor = (profile) => {
    const portal = portals.get(profile.id)
    if (!portal?.completed_at || !onCreateStudent) return
    let student
    try {
      student = onCreateStudent(newStudentFromPortal(portal, profile, todayKey()))
    } catch (err) {
      setError(`No se pudo crear el alumno: ${err.message}`)
      return
    }
    save(profile, linkPatch({ kind: 'student', id: student.id, label: student.name }, profile))
  }

  const resetPermissions = (profile) =>
    withSaving(profile.id, async () => {
      await resetProfilePermissions(client, profile.id)
      setPerms((p) => ({ ...p, overrides: p.overrides.filter((o) => o.profile_id !== profile.id) }))
    })

  return (
    <div className="access-view">
      <div className="contacts-header">
        <h1 className="contacts-title">Accesos</h1>
        <div className="access-header-row">
          <p className="access-muted">
            Las cuentas nuevas entran como pendientes. Al ponerle «Equipo» a una cuenta, elige su área: sus permisos son los del
            área, y puedes cambiar los de cada persona.
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
            const own = perms ? perms.overrides.filter((o) => o.profile_id === p.id) : []
            const permissions = perms ? effectivePermissions(p.area, perms.areaRows, own) : null
            const permsOpen = openPerms === p.id
            return (
              <li key={p.id} className="access-row">
                <div className="access-account">
                  <span className="access-email">
                    {p.email || 'Sin email'}
                    {self && <span className="access-you">Tú</span>}
                  </span>
                  <NameField key={p.display_name} value={p.display_name} disabled={busy} onSave={(display_name) => save(p, { display_name })} />
                  <span className="access-muted">
                    {providerText(p) ? `${providerText(p)} · desde el ` : 'Desde el '}
                    {createdText(p.created_at)}
                  </span>
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

                {p.role === 'alumno' && !p.linked_student_id && onCreateStudent && (
                  <div className="access-team">
                    <div className="access-team-row">
                      <button
                        type="button"
                        className="contacts-groups-btn"
                        disabled={busy || !portals.get(p.id)?.completed_at}
                        onClick={() => createStudentFor(p)}
                      >
                        <UserPlus size={14} strokeWidth={1.75} />
                        Crear alumno nuevo con sus datos
                      </button>
                      <span className="access-muted">
                        {portals.get(p.id)?.completed_at
                          ? 'O únela a un alumno que ya tengas con «Unida a».'
                          : 'Se podrá cuando complete su perfil al entrar. Mientras, puedes unirla a un alumno que ya tengas.'}
                      </span>
                    </div>
                  </div>
                )}

                {p.role === 'equipo' && (
                  <div className="access-team">
                    {!perms ? (
                      <p className="access-muted">
                        Para elegir su área y sus permisos falta ejecutar en Supabase el SQL de la parte 2
                        (supabase/parte2_papeles_permisos.sql).
                      </p>
                    ) : (
                      <>
                        <div className="access-team-row">
                          <label className="access-field access-area">
                            <span className="access-field-label">Área</span>
                            <select value={p.area || ''} disabled={busy} onChange={(e) => save(p, { area: e.target.value || null })}>
                              <option value="">Sin área</option>
                              {perms.areas.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            className={`contacts-groups-btn${permsOpen ? ' on' : ''}`}
                            aria-expanded={permsOpen}
                            onClick={() => setOpenPerms(permsOpen ? null : p.id)}
                          >
                            <ShieldCheck size={14} strokeWidth={1.75} />
                            {permsOpen ? 'Ocultar permisos' : 'Permisos'}
                            {own.length > 0 && <span className="access-perm-own">{own.length} propios</span>}
                          </button>
                        </div>
                        {permsOpen && (
                          <PermissionsTable
                            profile={p}
                            permissions={permissions}
                            overridden={own.length > 0}
                            busy={busy}
                            onChange={(screen, level) => savePermission(p, screen, level)}
                            onReset={() => resetPermissions(p)}
                          />
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

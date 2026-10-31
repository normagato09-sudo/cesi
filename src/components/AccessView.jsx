import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { CircleCheck, CircleDashed, ChevronDown, KeyRound, RefreshCw, RotateCcw, Search, ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import Modal from './shared/Modal.jsx'
import { useSync } from '../lib/sync/syncContext.js'
import {
  DELETE_WORD,
  DISPLAY_NAME_MAX,
  ROLES,
  ROLE_LABELS,
  accountName,
  canChangeRole,
  canDeleteAccount,
  deleteAccount,
  filterProfiles,
  initialsOf,
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

// Confirmación de «Eliminar cuenta»: hay que escribir ELIMINAR.
function DeleteAccountDialog({ name, busy, error, onCancel, onConfirm }) {
  const [word, setWord] = useState('')
  const ok = word.trim() === DELETE_WORD
  return (
    <Modal title={`¿Seguro que quieres eliminar la cuenta de ${name}?`} onClose={onCancel}>
      <form
        className="access-delete"
        onSubmit={(e) => {
          e.preventDefault()
          if (ok && !busy) onConfirm()
        }}
      >
        <p>
          Se borra la cuenta de verdad: ya no podrá entrar, y se borran su perfil, sus permisos propios y sus respuestas a
          reuniones. Sus fichajes y tareas se quedan, con «(cuenta eliminada)». Las reuniones que organizó y aún no han pasado se
          cancelan; las pasadas se quedan. <strong>No se puede deshacer.</strong>
        </p>
        <label className="access-delete-field">
          <span>
            Escribe <strong>{DELETE_WORD}</strong> para confirmar
          </span>
          <input type="text" value={word} onChange={(e) => setWord(e.target.value)} autoFocus autoComplete="off" />
        </label>
        {error && (
          <p className="access-error" role="alert">
            {error}
          </p>
        )}
        <div className="access-delete-actions">
          <button type="button" className="contacts-groups-btn" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" className="access-danger-btn" disabled={!ok || busy}>
            <Trash2 size={14} strokeWidth={1.75} />
            {busy ? 'Eliminando…' : 'Eliminar cuenta'}
          </button>
        </div>
      </form>
    </Modal>
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
  const [openId, setOpenId] = useState(null) // cuenta con el panel abierto
  const [filter, setFilter] = useState({ query: '', role: '', area: '' })
  const [deleting, setDeleting] = useState(null) // cuenta que se va a eliminar
  const [portals, setPortals] = useState(() => new Map()) // perfiles (account_profiles), por cuenta
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

  const removeAccount = (profile) =>
    withSaving(profile.id, async () => {
      await deleteAccount(client, profile.id)
      setProfiles((list) => list.filter((p) => p.id !== profile.id))
      setDeleting(null)
      setOpenId(null)
    })

  const areaList = perms?.areas || AREAS
  const areaLabel = (id) => areaList.find((a) => a.id === id)?.name || ''
  const shown = profiles ? filterProfiles(profiles, filter, portals) : []

  return (
    <div className="access-view">
      <div className="contacts-header">
        <h1 className="contacts-title">Accesos</h1>
        <div className="access-header-row">
          <p className="access-muted">
            Las cuentas nuevas entran como pendientes. Pulsa una cuenta para cambiar su papel, su área, sus permisos o a quién está
            unida.
          </p>
          <button type="button" className="contacts-groups-btn" onClick={load} title="Volver a cargar">
            <RefreshCw size={14} strokeWidth={1.75} />
            Actualizar
          </button>
        </div>
        <div className="access-toolbar">
          <label className="contacts-search">
            <Search size={15} strokeWidth={1.75} aria-hidden="true" />
            <input
              type="search"
              value={filter.query}
              onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
              placeholder="Buscar por nombre o email"
              aria-label="Buscar cuentas"
            />
          </label>
          <select value={filter.role} onChange={(e) => setFilter((f) => ({ ...f, role: e.target.value }))} aria-label="Filtrar por papel">
            <option value="">Todos los papeles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <select value={filter.area} onChange={(e) => setFilter((f) => ({ ...f, area: e.target.value }))} aria-label="Filtrar por área">
            <option value="">Todas las áreas</option>
            <option value="none">Sin área</option>
            {areaList.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
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
          {shown.length === 0 && <li className="access-muted access-none">No hay cuentas con esos filtros.</li>}
          {shown.map((p) => {
            const self = p.id === userId
            const busy = !!saving[p.id]
            const locked = !canChangeRole(p, userId)
            const own = perms ? perms.overrides.filter((o) => o.profile_id === p.id) : []
            const permissions = perms ? effectivePermissions(p.area, perms.areaRows, own) : null
            const permsOpen = openPerms === p.id
            const open = openId === p.id
            const name = accountName(p, portals.get(p.id))
            const complete = !!portals.get(p.id)?.completed_at
            return (
              <li key={p.id} className={`access-row${open ? ' open' : ''}`}>
                <button type="button" className="access-item" aria-expanded={open} onClick={() => setOpenId(open ? null : p.id)}>
                  <span className={`access-avatar role-${p.role}`} aria-hidden="true">
                    {initialsOf(name)}
                  </span>
                  <span className="access-account">
                    <span className="access-name">
                      {name}
                      {self && <span className="access-you">Tú</span>}
                    </span>
                    <span className="access-muted access-email">{p.email || 'Sin email'}</span>
                  </span>
                  <span className="access-tags">
                    <span className={`access-tag role-${p.role}`}>{ROLE_LABELS[p.role] || p.role}</span>
                    {p.role === 'equipo' && <span className={`access-tag area${p.area ? '' : ' none'}`}>{areaLabel(p.area) || 'Sin área'}</span>}
                    {p.role !== 'pendiente' &&
                      (complete ? (
                        <span className="access-profile done">
                          <CircleCheck size={13} strokeWidth={2} aria-hidden="true" />
                          Perfil completo
                        </span>
                      ) : (
                        <span className="access-profile">
                          <CircleDashed size={13} strokeWidth={2} aria-hidden="true" />
                          Sin completar
                        </span>
                      ))}
                  </span>
                  <span className="access-meta access-muted">
                    <span>{providerText(p) || '—'}</span>
                    <span>{createdText(p.created_at)}</span>
                  </span>
                  <ChevronDown size={16} strokeWidth={1.75} className="access-chevron" aria-hidden="true" />
                </button>

                {open && (
                  <div className="access-panel">
                    <div className="access-panel-grid">
                      <label className="access-field">
                        <span className="access-field-label">Nombre</span>
                        <NameField key={p.display_name} value={p.display_name} disabled={busy} onSave={(display_name) => save(p, { display_name })} />
                      </label>
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
                    {canDeleteAccount(p, userId) && (
                      <div className="access-danger">
                        <span className="access-muted">Borra la cuenta de verdad. Sus fichajes y tareas se conservan.</span>
                        <button type="button" className="access-danger-btn" disabled={busy} onClick={() => setDeleting(p)}>
                          <Trash2 size={14} strokeWidth={1.75} />
                          Eliminar cuenta
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {deleting && (
        <DeleteAccountDialog
          name={accountName(deleting, portals.get(deleting.id))}
          busy={!!saving[deleting.id]}
          error={error}
          onCancel={() => setDeleting(null)}
          onConfirm={() => removeAccount(deleting)}
        />
      )}
    </div>
  )
}

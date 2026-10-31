import { useEffect, useMemo, useState } from 'react'
import { LogOut, Pencil } from 'lucide-react'
import MobileNav from './MobileNav.jsx'
import ComingSoonView from './ComingSoonView.jsx'
import { ProfileFormPage, ProfileLoadError, ProfileLoading } from './ProfileScreens.jsx'
import { useMyProfile } from './useMyProfile'
import { allItems, memberGroups, sectionActive } from './sections.js'
import { LEVEL_LABELS, SCREENS, areaName, fetchMyPermissions } from '../lib/permissions'
import { zoneShort } from '../lib/studentPortal'
import { countryName, localTimeZone } from '../lib/timezones'
import SharedCalendar from './shared/SharedCalendar.jsx'
import '../App.css'
import './Sidebar.css'
import './ContactsView.css'
import './MemberApp.css'

// App de una persona de equipo: «Mi panel» y, en el menú, solo las pantallas a las que tiene
// permiso (my_permissions(), ver supabase/schema.sql). De momento cada pantalla dice
// «Próximamente»: todavía no ve ningún dato de la ceo.
// Como el alumno, hasta que completa su perfil (account_profiles) no puede hacer nada más.
// Con `levels` y `preview` ({ account, profile }, vista previa de «Ver como») no se pide nada a
// Supabase; readOnly desactiva guardar y cerrar sesión. El calendario de la vista previa se lee con
// calendarClient (el de la ceo) y calendarAs (la cuenta que se está viendo).
export default function MemberApp({
  client,
  userId,
  email,
  name,
  area,
  onSignOut,
  levels: previewLevels = null,
  preview = null,
  readOnly = false,
  calendarClient = null,
  calendarAs = null,
}) {
  const [fetchedLevels, setLevels] = useState(null)
  const [error, setError] = useState(false)
  const [section, setSection] = useState('home')
  const [editing, setEditing] = useState(false)
  const levels = previewLevels || fetchedLevels
  const { data, loadError, retry, save } = useMyProfile(client, userId, preview)

  useEffect(() => {
    if (previewLevels || !client) return
    let active = true
    fetchMyPermissions(client).then(
      (next) => active && setLevels(next),
      () => active && setError(true),
    )
    return () => {
      active = false
    }
  }, [client, previewLevels])

  const groups = useMemo(() => memberGroups(levels || {}), [levels])
  const current = allItems(groups).find((item) => item.id === section)
  const allowed = SCREENS.filter((s) => levels && levels[s.id] !== 'none')

  const handleSignOut = () => {
    if (window.confirm('¿Cerrar sesión?')) onSignOut()
  }

  if (loadError && !data) return <ProfileLoadError onRetry={retry} onSignOut={onSignOut} readOnly={readOnly} />
  if (!data) return <ProfileLoading />

  const { account, profile } = data
  const completed = !!profile?.completed_at

  // Primera vez (o editando): el formulario a pantalla completa.
  if (!completed || editing) {
    return (
      <ProfileFormPage
        profile={profile}
        account={account}
        audience="equipo"
        readOnly={readOnly}
        onSave={async (row) => {
          if (readOnly) return
          await save(row)
          setEditing(false)
          window.scrollTo(0, 0)
        }}
        onCancel={() => setEditing(false)}
        onSignOut={onSignOut}
      />
    )
  }

  const shownName = profile.full_name || name

  return (
    <div className="app member-app">
      <aside className="sidebar member-sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-logo">C</span>
          <span className="sidebar-title">CIFA</span>
        </div>
        <nav className="sidebar-nav" aria-label="Secciones">
          {groups.map((group) => (
            <div key={group.id} className="sidebar-nav-group" role="group" aria-labelledby={`member-group-${group.id}`}>
              <span id={`member-group-${group.id}`} className="sidebar-nav-group-title">
                {group.label}
              </span>
              {group.items.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={`sidebar-nav-item${sectionActive(id, section) ? ' active' : ''}`}
                  aria-current={sectionActive(id, section) ? 'page' : undefined}
                  onClick={() => setSection(id)}
                >
                  <Icon size={17} strokeWidth={1.75} />
                  <span className="sidebar-nav-label">{label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button type="button" className="sidebar-backup-btn" onClick={handleSignOut} disabled={readOnly}>
            <LogOut size={16} strokeWidth={1.75} />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      <main className="app-main">
        {section === 'shared-calendar' ? (
          <SharedCalendar
            client={preview ? calendarClient : client}
            meId={preview ? calendarAs : userId}
            zone={profile.time_zone || localTimeZone()}
            asId={preview ? calendarAs : null}
            readOnly={readOnly}
          />
        ) : section === 'home' || !current ? (
          <div className="member-panel">
            <header className="member-panel-head">
              <div className="member-panel-who">
                <h1>Hola{shownName ? `, ${shownName}` : ''}</h1>
                <p className="member-panel-area">{area ? `Equipo · ${areaName(area)}` : 'Equipo · sin área todavía'}</p>
                <p className="member-panel-place">
                  {countryName(profile.country)} · {zoneShort(profile.time_zone)}
                </p>
              </div>
              <button type="button" className="member-edit-btn" onClick={() => setEditing(true)} aria-label="Editar mi perfil" title="Editar mi perfil">
                <Pencil size={16} strokeWidth={1.75} />
              </button>
            </header>
            <p className="member-panel-note">Aquí verás tus tareas y tu fichaje muy pronto.</p>

            {error ? (
              <p className="member-panel-note">No se pudieron cargar tus permisos. Comprueba la conexión y vuelve a entrar.</p>
            ) : levels === null ? (
              <p className="member-panel-note">Cargando tus permisos…</p>
            ) : allowed.length === 0 ? (
              <p className="member-panel-note">Todavía no tienes acceso a ninguna pantalla. La dirección te lo dará en Accesos.</p>
            ) : (
              <section className="member-panel-access">
                <h2>Tus accesos</h2>
                <ul>
                  {allowed.map((s) => (
                    <li key={s.id}>
                      <span>{s.label}</span>
                      <span className={`member-level ${levels[s.id]}`}>{LEVEL_LABELS[levels[s.id]]}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <p className="member-panel-email">Has entrado como {email}.</p>
            <button type="button" className="contacts-groups-btn member-signout" onClick={handleSignOut} disabled={readOnly}>
              <LogOut size={14} strokeWidth={1.75} />
              Cerrar sesión
            </button>
          </div>
        ) : (
          <ComingSoonView
            title={current.label}
            Icon={current.Icon}
            note={levels?.[current.screen] === 'write' ? 'Podrás verla y editarla.' : 'Podrás verla.'}
          />
        )}
      </main>

      <MobileNav section={section} onSectionChange={setSection} groups={groups} />
    </div>
  )
}

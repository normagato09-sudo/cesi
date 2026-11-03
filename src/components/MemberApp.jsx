import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { LogOut, MessageCircle, Pencil } from 'lucide-react'
import MobileNav from './MobileNav.jsx'
import ComingSoonView from './ComingSoonView.jsx'
import { ProfileFormPage, ProfileLoadError, ProfileLoading } from './ProfileScreens.jsx'
import { useMyProfile } from './useMyProfile'
import { allItems, memberGroups, sectionActive } from './sections.js'
import { areaName, fetchMyPermissions } from '../lib/permissions'
import { zoneShort } from '../lib/studentPortal'
import { countryName } from '../lib/timezones'
import SharedCalendar from './shared/SharedCalendar.jsx'
import TeamTasksView from './team/TeamTasksView.jsx'
import ClockView from './team/ClockView.jsx'
import MyTeamTasks from './team/MyTeamTasks.jsx'
import MyClasses from './team/MyClasses.jsx'
import AreaSummary from './team/AreaSummary.jsx'
import DirectivoSummary from './team/DirectivoSummary.jsx'
import MemberContacts from './team/MemberContacts.jsx'
import { useExternalContacts } from './team/useExternalContacts'
import { NextStepsCard } from './alliances/AllianceHome.jsx'
import BoardView from './boards/BoardView.jsx'
import BoardsView from './boards/BoardsView.jsx'
import { MyBoardCard } from './boards/BoardHome.jsx'
import { boardOf } from '../lib/boards'
import NoticesView from './notices/NoticesView.jsx'
import MessagesView, { MessagesPrivate } from './chat/MessagesView.jsx'
import { useChatUnread } from './chat/useChatUnread'
import { unreadText } from '../lib/chat'
import FinanceView from './finance/FinanceView.jsx'
import FinanceHomeCard from './finance/FinanceHome.jsx'
import { PendingNoticesCard, UnreadNotices } from './notices/NoticesHome.jsx'
import AreaGoals from './team/AreaGoals.jsx'
import GoalsView from './team/GoalsView.jsx'
import { DIRECTIVO_AREA } from '../lib/teamWork'
import { SECTION_SCREENS } from '../lib/screenData'
import '../App.css'
import './Sidebar.css'
import './ContactsView.css'
import { viewZone } from '../lib/zoneView'
import './MemberApp.css'

// Las pantallas de la ceo (solo se cargan al abrir una).
const MemberScreen = lazy(() => import('./team/MemberScreen.jsx'))
const OrgChartView = lazy(() => import('./OrgChartView.jsx'))

// App de una persona de equipo: «Mi panel» y, en el menú, solo las pantallas a las que tiene
// permiso (my_permissions(), ver supabase/schema.sql). Las pantallas de la ceo (Contactos
// externos, Equipo, Vacantes, Cursos, Alumnos, Asistencia) se ven con sus datos, de momento en
// solo lectura (ver MemberScreen y la parte 11).
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
  // «Ver como» un área (sin cuenta): las pantallas se leen con el cliente de la ceo y esa área.
  screensClient = null,
  screensArea = null,
}) {
  const [fetchedLevels, setLevels] = useState(null)
  const [error, setError] = useState(false)
  const [section, setSection] = useState('home')
  // Desde el Organigrama: Mensajes con el chat de esa cuenta y Equipo con su ficha abierta.
  const [messagesWith, setMessagesWith] = useState(null)
  const [fichaId, setFichaId] = useState(null)
  const go = (id) => {
    setMessagesWith(null)
    setFichaId(null)
    setSection(id)
  }
  const [editing, setEditing] = useState(false)
  const levels = previewLevels || fetchedLevels
  const { data, loadError, retry, save } = useMyProfile(client, userId, preview)
  // Mensajes sin leer (nunca en «Ver como»: los mensajes son privados).
  const unread = useChatUnread(preview ? null : client)
  // Mis contactos (y los de Alianzas) para «Nueva reunión»; en «Ver como», ninguno (son privados).
  const externalContacts = useExternalContacts(preview ? null : client, area)

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

  const groups = useMemo(() => memberGroups(levels || {}, area), [levels, area])
  const current = allItems(groups).find((item) => item.id === section)

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
  const zone = viewZone(profile)
  // Tareas, fichaje y calendario: con mi cuenta o, en «Ver como», con la de la ceo leyendo los de
  // esa persona (calendarAs), en solo lectura.
  const workClient = preview ? calendarClient : client
  const workAs = preview ? calendarAs : null
  const me = { id: preview ? calendarAs : userId, role: 'equipo', area, boss: area === DIRECTIVO_AREA }

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
                  onClick={() => go(id)}
                >
                  <Icon size={17} strokeWidth={1.75} />
                  <span className="sidebar-nav-label">{label}</span>
                  {id === 'messages' && unread > 0 && (
                    <span className="sidebar-nav-badge" aria-label={`${unread} sin leer`}>
                      {unread}
                    </span>
                  )}
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
          <SharedCalendar client={workClient} meId={me.id} zone={zone} asId={workAs} readOnly={readOnly} externalContacts={externalContacts} />
        ) : section === 'team-tasks' ? (
          <TeamTasksView client={workClient} me={me} zone={zone} asId={workAs} readOnly={readOnly} />
        ) : section === 'goals' ? (
          <GoalsView client={workClient} me={me} zone={zone} asId={workAs} readOnly={readOnly} />
        ) : section === 'finance' && (area === 'finanzas' || me.boss) ? (
          <FinanceView client={workClient} me={me} zone={zone} asId={workAs} readOnly={readOnly} />
        ) : section === 'contacts' ? (
          <MemberContacts
            client={client}
            area={area}
            zone={zone}
            preview={!!preview}
            screensClient={screensClient}
            asId={workAs}
            asArea={preview && !workAs ? screensArea : null}
          />
        ) : section === 'org' ? (
          <Suspense fallback={<p className="member-screen-note">Cargando…</p>}>
            <OrgChartView
              client={workClient}
              meId={me.id}
              onMessage={
                preview
                  ? null
                  : (id) => {
                      setMessagesWith(id)
                      setSection('messages')
                    }
              }
              onOpenFicha={
                allItems(groups).some((item) => item.id === 'team')
                  ? (id) => {
                      setFichaId(id)
                      setSection('team')
                    }
                  : null
              }
            />
          </Suspense>
        ) : section === 'messages' ? (
          preview ? <MessagesPrivate /> : <MessagesView key={messagesWith || ''} client={client} meId={userId} zone={zone} withPerson={messagesWith} />
        ) : section === 'notices' ? (
          <NoticesView client={workClient} me={me} asId={workAs} readOnly={readOnly} />
        ) : section === 'board' && boardOf(area) ? (
          <BoardView client={workClient} area={area} meId={me.id} zone={zone} asId={workAs} readOnly={readOnly} canEdit canComment />
        ) : section === 'boards' && me.boss ? (
          <BoardsView client={workClient} me={me} zone={zone} asId={workAs} readOnly={readOnly} />
        ) : section === 'clock' ? (
          <ClockView client={workClient} me={me} zone={zone} asId={workAs} readOnly={readOnly} />
        ) : current && SECTION_SCREENS[section] ? (
          <Suspense fallback={<p className="member-screen-note">Cargando…</p>}>
            <MemberScreen client={preview ? screensClient : client} section={section} zone={zone} asId={workAs} asArea={preview && !workAs ? screensArea : null} initialSelectedId={section === 'team' ? fichaId : null} />
          </Suspense>
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

            {!preview && unread > 0 && (
              <button type="button" className="member-unread-messages" onClick={() => go('messages')}>
                <MessageCircle size={16} strokeWidth={1.75} />
                {unreadText(unread)}
              </button>
            )}
            {/* «Ver como» Directivo sin persona: su Inicio depende de quién es (sus tareas, sus cifras). */}
            {preview && !workAs && me.boss ? (
              <p className="member-panel-note">Elige una persona para ver su Inicio.</p>
            ) : (
              <>
                <UnreadNotices client={workClient} asId={workAs} readOnly={readOnly} />
                <MyClasses
                  client={workClient}
                  zone={zone}
                  asId={workAs}
                  onOpen={allItems(groups).some((item) => item.id === 'attendance') ? () => setSection('attendance') : null}
                />
                <MyTeamTasks client={workClient} zone={zone} asId={workAs} onOpenAll={() => setSection('team-tasks')} />
                <AreaGoals client={workClient} area={area} zone={zone} asId={workAs} onOpenAll={() => setSection('goals')} />
                <AreaSummary
                  client={workClient}
                  area={area}
                  zone={zone}
                  asId={workAs}
                  onOpen={() => setSection(area === 'formacion' ? 'attendance' : 'alliances')}
                />
                {area === 'alianzas' && <NextStepsCard client={workClient} zone={zone} asId={workAs} onOpen={() => setSection('alliances')} />}
                {boardOf(area) && <MyBoardCard client={workClient} area={area} meId={me.id} zone={zone} asId={workAs} onOpen={() => setSection('board')} />}
                {me.boss && <DirectivoSummary client={workClient} asId={workAs} />}
                {me.boss && <PendingNoticesCard client={workClient} asId={workAs} onOpen={() => setSection('notices')} />}
                {area === 'finanzas' && <FinanceHomeCard client={workClient} asId={workAs} onOpen={() => setSection('finance')} />}
              </>
            )}

            {/* Los permisos no se enseñan nunca (solo deciden el menú). */}
            {error && <p className="member-panel-note">No se pudo cargar todo tu menú. Comprueba la conexión y vuelve a entrar.</p>}

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
            note="Muy pronto."
          />
        )}
      </main>

      <MobileNav section={section} onSectionChange={go} groups={groups} badges={{ messages: unread }} />
    </div>
  )
}

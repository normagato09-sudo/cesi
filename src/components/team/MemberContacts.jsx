import { useCallback, useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import ContactsView from '../ContactsView.jsx'
import MemberScreen from './MemberScreen.jsx'
import { useMinuteClock } from '../../hooks/useMinuteClock'
import {
  createPersonalContact,
  createPersonalGroup,
  deletePersonalContact,
  deletePersonalGroup,
  listPersonalContacts,
  listPersonalGroups,
  personalErrorText,
  updatePersonalContact,
  updatePersonalGroup,
} from '../../lib/personalContacts'
import '../chat/Messages.css'
import './MemberContacts.css'

const noop = () => {}

// «Mis contactos»: los de esa persona (privados, en Supabase), con las mismas pantallas que los
// míos: crear, editar, borrar y sus grupos.
function MyContacts({ client }) {
  const now = useMinuteClock()
  const [contacts, setContacts] = useState(null)
  const [groups, setGroups] = useState([])
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    Promise.all([listPersonalContacts(client), listPersonalGroups(client)]).then(
      ([rows, groupRows]) => {
        if (!active) return
        setContacts(rows)
        setGroups(groupRows)
        setError(null)
      },
      (err) => active && setError(err.message),
    )
    return () => {
      active = false
    }
  }, [client, reload])

  const refresh = useCallback(() => setReload((n) => n + 1), [])
  // Los errores del servidor, en un aviso; después se vuelve a leer.
  const run = (fn) => async (...args) => {
    try {
      return await fn(...args)
    } catch (err) {
      window.alert(err.message || personalErrorText(err))
      return null
    } finally {
      refresh()
    }
  }

  if (error) return <p className="member-screen-note error">{error}</p>
  if (!contacts) return <p className="member-screen-note">Cargando…</p>

  return (
    <ContactsView
      readOnly
      editExternal
      personal
      title="Mis contactos"
      contacts={contacts}
      groups={groups}
      rawEvents={[]}
      now={now}
      selectedContactId={selectedId}
      onSelectContact={setSelectedId}
      // El formulario espera el error para enseñarlo (no se envuelve).
      onAddContact={async (values) => {
        const created = await createPersonalContact(client, values)
        refresh()
        return created
      }}
      onEditContact={async (id, values) => {
        const saved = await updatePersonalContact(client, id, values)
        refresh()
        return saved
      }}
      onRemoveContact={run((id) => deletePersonalContact(client, id))}
      onOpenEvent={noop}
      onNewMeetingWithContact={noop}
      onCreateGroup={run(({ name, color }) => createPersonalGroup(client, name, color || ''))}
      onRenameGroup={run((id, name) => updatePersonalGroup(client, id, { name: name.trim() }))}
      onGroupColor={run((id, color) => updatePersonalGroup(client, id, { color }))}
      onDeleteGroup={run((id) => deletePersonalGroup(client, id))}
      areas={[]}
      onSaveTeamProfile={noop}
      onArchiveContact={noop}
      onUnarchiveContact={noop}
      onReturnToTeam={noop}
      onOpenTeamMember={noop}
      onOpenCandidate={noop}
    />
  )
}

/**
 * «Contactos» en el menú de todo el equipo: «Mis contactos» (privados) y, en Alianzas y Directivo,
 * la pestaña «Alianzas» (los contactos de Alianzas, con su seguimiento; Directivo, solo ver).
 * preview: «Ver como» (los personales no se ven: son privados). screensClient / asId / asArea:
 * los de la pestaña Alianzas en «Ver como».
 */
export default function MemberContacts({ client, area, zone, preview = false, screensClient = null, asId = null, asArea = null }) {
  const withAlliance = area === 'alianzas' || area === 'direccion'
  const [tab, setTab] = useState('mine')

  return (
    <div className="mc-root">
      {withAlliance && (
        <div className="mc-tabs" role="tablist" aria-label="Contactos">
          <button type="button" role="tab" aria-selected={tab === 'mine'} className={`mc-tab${tab === 'mine' ? ' on' : ''}`} onClick={() => setTab('mine')}>
            Mis contactos
          </button>
          <button type="button" role="tab" aria-selected={tab === 'alliance'} className={`mc-tab${tab === 'alliance' ? ' on' : ''}`} onClick={() => setTab('alliance')}>
            Alianzas
          </button>
        </div>
      )}
      <div className="mc-body">
        {tab === 'alliance' && withAlliance ? (
          <MemberScreen client={preview ? screensClient : client} section="contacts" zone={zone} asId={asId} asArea={asArea} />
        ) : preview ? (
          <div className="ms-root ms-private">
            <Lock size={28} strokeWidth={1.5} />
            <p className="ms-private-title">Los contactos personales son privados</p>
            <p>En «Ver como» no se muestran los contactos de otras personas.</p>
          </div>
        ) : client ? (
          <MyContacts client={client} />
        ) : null}
      </div>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { Handshake, X } from 'lucide-react'
import AlliancePanel from './AlliancePanel.jsx'
import ContactAvatar from '../ContactAvatar.jsx'
import { ContactFields } from '../ContactInfo.jsx'
import {
  ALLIANCE_STATUSES,
  ALLIANCE_TYPES,
  STATUS_LABEL,
  TYPE_LABEL,
  allianceContacts,
  allianceOf,
  amountLabel,
  boardColumns,
  dayLabel,
  filterAlliances,
  isExternalContact,
  isNextStepOverdue,
} from '../../lib/alliances'
import '../EventFormModal.css'
import '../ContactsView.css'
import '../SectionPage.css'
import './Alliances.css'

function AllianceCard({ contact, today, onOpen, showStatus = false }) {
  const a = allianceOf(contact)
  const late = isNextStepOverdue(a, today)
  return (
    <button type="button" className="al-card" onClick={() => onOpen(contact.id)}>
      <strong>{contact.name || 'Sin nombre'}</strong>
      <span className="al-card-meta">
        <span>{TYPE_LABEL[a.type] || a.type}</span>
        {showStatus && <span>{STATUS_LABEL[a.status] || a.status}</span>}
        {contact.organization && <span>{contact.organization}</span>}
        {a.amount !== null && a.amount !== undefined && <span>{amountLabel(a.amount)}</span>}
        {a.ownerName && <span>{a.ownerName}</span>}
      </span>
      {(a.nextStep || a.nextStepDate) && (
        <span className={`al-card-meta${late ? ' al-late' : ''}`}>
          Próximo paso: {a.nextStep || 'sin describir'}
          {a.nextStepDate && ` · ${dayLabel(a.nextStepDate)}`}
        </span>
      )}
    </button>
  )
}

/**
 * «Alianzas»: los contactos externos con seguimiento, en tablero (una columna por estado) o en
 * lista con filtros (tipo, estado y responsable). Al pulsar uno se abre su ficha con el
 * seguimiento. canEdit: Alianzas y yo; Directivo y «Ver como», solo ver. api: ver AlliancePanel.
 */
export default function AlliancesView({ contacts, canEdit, people = [], api, today }) {
  const [mode, setMode] = useState('board')
  const [filters, setFilters] = useState({ type: '', status: '', owner: '' })
  const [openId, setOpenId] = useState(null)
  const columns = useMemo(() => boardColumns(contacts), [contacts])
  const listed = useMemo(() => filterAlliances(contacts, filters), [contacts, filters])
  const tracked = allianceContacts(contacts)
  const withoutTracking = useMemo(
    () => contacts.filter((c) => isExternalContact(c) && !allianceOf(c)).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es')),
    [contacts],
  )
  const open = openId ? contacts.find((c) => c.id === openId) : null
  const setFilter = (patch) => setFilters((f) => ({ ...f, ...patch }))
  const owners = [...people]
  for (const c of tracked) {
    const a = allianceOf(c)
    if (a.ownerId && !owners.some((p) => p.id === a.ownerId)) owners.push({ id: a.ownerId, name: a.ownerName || 'Responsable' })
  }

  return (
    <div className="section-page">
      <div className="contacts-header">
        <h1 className="contacts-title">Alianzas</h1>
        <p className="section-page-hint">Patrocinadores, colaboradores y partners: en qué punto está cada uno y cuál es el próximo paso.</p>
      </div>
      <div className="section-page-body section-page-padded">
        <div className="al-toolbar">
          <div className="contacts-group-filter" role="group" aria-label="Cómo verlas">
            {[
              { id: 'board', label: 'Tablero' },
              { id: 'list', label: 'Lista' },
            ].map((m) => (
              <button key={m.id} type="button" className={`contacts-group-filter-btn${mode === m.id ? ' on' : ''}`} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
          {canEdit && withoutTracking.length > 0 && (
            <div className="al-filters">
              <select value="" onChange={(e) => e.target.value && setOpenId(e.target.value)} aria-label="Añadir seguimiento a un contacto">
                <option value="">+ Seguimiento para un contacto…</option>
                {withoutTracking.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || 'Sin nombre'}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {tracked.length === 0 ? (
          <div className="contacts-empty">
            <Handshake size={28} strokeWidth={1.5} />
            <p className="contacts-empty-title">Todavía no hay alianzas</p>
            <p>{canEdit ? 'Añade el seguimiento a un contacto externo (arriba o desde su ficha en Contactos externos).' : 'Cuando Alianzas añada el seguimiento a un contacto, saldrá aquí.'}</p>
          </div>
        ) : mode === 'board' ? (
          <div className="al-board">
            {columns.map((col) => (
              <section key={col.id} className="al-column" aria-label={col.label}>
                <h3>
                  <span>{col.label}</span>
                  <span>{col.contacts.length}</span>
                </h3>
                {col.contacts.map((c) => (
                  <AllianceCard key={c.id} contact={c} today={today} onOpen={setOpenId} />
                ))}
              </section>
            ))}
          </div>
        ) : (
          <>
            <div className="al-filters">
              <select value={filters.type} onChange={(e) => setFilter({ type: e.target.value })} aria-label="Tipo">
                <option value="">Todos los tipos</option>
                {ALLIANCE_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <select value={filters.status} onChange={(e) => setFilter({ status: e.target.value })} aria-label="Estado">
                <option value="">Todos los estados</option>
                {ALLIANCE_STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <select value={filters.owner} onChange={(e) => setFilter({ owner: e.target.value })} aria-label="Responsable">
                <option value="">Todos los responsables</option>
                <option value="none">Sin responsable</option>
                {owners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            {listed.length === 0 ? (
              <p className="al-muted">Ninguna con esos filtros.</p>
            ) : (
              <ul className="al-list">
                {listed.map((c) => (
                  <li key={c.id}>
                    <AllianceCard contact={c} today={today} onOpen={setOpenId} showStatus />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {open && (
        <div className="event-form-backdrop" onClick={() => setOpenId(null)}>
          <div className="event-form contact-form" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Ficha de ${open.name}`}>
            <div className="event-form-header">
              <h2>
                <ContactAvatar name={open.name} photo={open.photo} size="sm" />
                {open.name || 'Sin nombre'}
              </h2>
              <button type="button" className="event-form-close" onClick={() => setOpenId(null)} aria-label="Cerrar">
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>
            <div className="event-form-body">
              <ContactFields contact={open} />
              <AlliancePanel contact={open} canEdit={canEdit} people={people} api={api} today={today} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

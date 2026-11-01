import { useEffect, useMemo, useState } from 'react'
import { History } from 'lucide-react'
import { DOC_TABLE_LABEL, changedLabel, listTeamEdits } from '../lib/teamEdits'
import './ContactsView.css'
import './SectionPage.css'
import './TeamEditsView.css'

const AREA_LABEL = { personas: 'RRHH', direccion: 'Directivo', alumno: 'Alumno' }

function when(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Un valor del registro en una línea (los objetos, resumidos).
function short(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return `${value.length} elemento${value.length === 1 ? '' : 's'}`
  if (typeof value === 'object') return 'cambios internos'
  const text = String(value)
  return text.length > 60 ? `${text.slice(0, 60)}…` : text
}

// «Cambios del equipo» (solo la ceo): lo que RRHH, Directivo y los alumnos (al apuntarse a un
// curso, parte 25) han cambiado en mis datos (parte 20),
// con quién, cuándo y qué campos (antes → después).
export default function TeamEditsView({ client }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [who, setWho] = useState('')
  const [open, setOpen] = useState(null)

  useEffect(() => {
    if (!client) return
    let active = true
    listTeamEdits(client).then(
      (data) => active && setRows(data),
      (err) => active && setError(err.message),
    )
    return () => {
      active = false
    }
  }, [client])

  const people = useMemo(() => [...new Set((rows || []).map((r) => r.who_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [rows])
  const shown = (rows || []).filter((r) => !who || r.who_name === who)

  return (
    <div className="section-page">
      <div className="contacts-header">
        <h1 className="contacts-title">Cambios del equipo</h1>
        <p className="section-page-hint">Lo que RRHH y Directivo han cambiado en tus datos: quién, cuándo y qué.</p>
      </div>
      <div className="section-page-body section-page-padded">
        {people.length > 1 && (
          <select className="te-filter" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Quién">
            <option value="">Todas las personas</option>
            {people.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}
        {error ? (
          <p className="te-error">{error}</p>
        ) : !rows ? (
          <p className="te-muted">Cargando…</p>
        ) : shown.length === 0 ? (
          <div className="contacts-empty">
            <History size={28} strokeWidth={1.5} />
            <p className="contacts-empty-title">Sin cambios</p>
            <p>Cuando RRHH o Directivo cambien algo en tus datos, saldrá aquí.</p>
          </div>
        ) : (
          <ul className="te-list">
            {shown.map((r) => (
              <li key={r.id}>
                <button type="button" className="te-row" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                  <span className="te-main">
                    <strong>
                      {r.action === 'alta' ? 'Creó' : 'Cambió'} {DOC_TABLE_LABEL[r.doc_table]?.toLowerCase() || r.doc_table}: {r.doc_name || r.doc_id}
                    </strong>
                    <span className="te-muted">
                      {r.who_name || '—'}
                      {r.who_area ? ` (${AREA_LABEL[r.who_area] || r.who_area})` : ''} · {when(r.at)}
                      {r.action !== 'alta' && ` · ${changedLabel(r)}`}
                    </span>
                  </span>
                </button>
                {open === r.id && (
                  <table className="te-detail">
                    <thead>
                      <tr>
                        <th>Campo</th>
                        {r.action !== 'alta' && <th>Antes</th>}
                        <th>Después</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(r.after || {}).map((k) => (
                        <tr key={k}>
                          <td>{changedLabel({ after: { [k]: true } })}</td>
                          {r.action !== 'alta' && <td>{short(r.before?.[k])}</td>}
                          <td>{short(r.after[k])}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

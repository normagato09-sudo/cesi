import { useEffect, useMemo, useState } from 'react'
import { Eye, EyeOff, MessageCircle, Search, UserRound, X } from 'lucide-react'
import { bossText, buildOrgChart, listOrgChart, orgChartErrorText, positionOf, sinceText } from '../lib/orgChart'
import { initialsOf } from '../lib/profiles'
import { formatMinutes } from '../lib/teamWork'
import { zoneShort } from '../lib/studentPortal'
import './OrgChartView.css'

// Cada minuto y al volver a la pestaña se vuelve a leer (así se ven solos los cambios de Accesos).
const REFRESH_MS = 60000

function PersonCard({ person, color = null, selected, onSelect }) {
  return (
    <button
      type="button"
      className={`oc-person${selected ? ' on' : ''}`}
      onClick={() => onSelect(person.id)}
      aria-pressed={selected}
      style={color ? { '--oc-color': color } : undefined}
    >
      <span className="oc-avatar" aria-hidden="true">
        {initialsOf(person.name)}
      </span>
      <span className="oc-person-text">
        <strong>{person.name}</strong>
        <span>{positionOf(person)}</span>
      </span>
    </button>
  )
}

function EmptyCard({ label }) {
  return (
    <div className="oc-person empty">
      <span className="oc-avatar" aria-hidden="true">
        ?
      </span>
      <span className="oc-person-text">
        <strong>Sin asignar</strong>
        <span>{label}</span>
      </span>
    </div>
  )
}

// Flecha hacia arriba (hacia el jefe), con su etiqueta.
function Arrow({ tone, label = null, className = '' }) {
  return (
    <div className={`oc-arrow ${tone} ${className}`} aria-hidden="true">
      <span className="oc-arrow-line" />
      {label && <span className="oc-arrow-label">{label}</span>}
    </div>
  )
}

/**
 * Organigrama del equipo (lo ven la ceo y todo el equipo, en solo lectura). Los datos salen de
 * Accesos (cesi_org_chart, parte 28). onMessage(id de cuenta): abrir su chat; onOpenFicha(id de la
 * ficha de Equipo): abrir su ficha (null si quien mira no tiene la pantalla Equipo).
 */
export default function OrgChartView({ client, meId = null, onMessage = null, onOpenFicha = null }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [showEmpty, setShowEmpty] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!client) return
    let active = true
    listOrgChart(client).then(
      (next) => {
        if (!active) return
        setRows(next)
        setError(null)
      },
      (err) => active && setError(orgChartErrorText(err)),
    )
    return () => {
      active = false
    }
  }, [client, tick])

  useEffect(() => {
    const again = () => setTick((n) => n + 1)
    const onVisible = () => document.visibilityState === 'visible' && again()
    const timer = window.setInterval(again, REFRESH_MS)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const chart = useMemo(() => buildOrgChart(rows || [], query), [rows, query])
  const selected = selectedId ? chart.people.get(selectedId) : null
  const select = (id) => setSelectedId((current) => (current === id ? null : id))
  const areas = showEmpty ? chart.areas : chart.areas.filter((a) => a.people.length > 0)
  const emptyCount = chart.areas.filter((a) => a.people.length === 0).length

  return (
    <div className="oc-root">
      <header className="oc-head">
        <div>
          <h1>Organigrama</h1>
          <p>Quién es quién en el equipo y a quién responde cada uno.</p>
        </div>
        <div className="oc-tools">
          <label className="oc-search">
            <Search size={15} strokeWidth={1.75} aria-hidden="true" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre" aria-label="Buscar por nombre" />
          </label>
          <button type="button" className="oc-btn" onClick={() => setShowEmpty((v) => !v)} disabled={emptyCount === 0 && showEmpty}>
            {showEmpty ? <EyeOff size={15} strokeWidth={1.75} /> : <Eye size={15} strokeWidth={1.75} />}
            {showEmpty ? 'Ocultar áreas vacías' : 'Mostrar áreas vacías'}
          </button>
        </div>
      </header>

      {error && <p className="oc-error">{error}</p>}
      {!rows && !error && <p className="oc-muted">Cargando…</p>}

      {rows && (
        <div className="oc-chart">
          <div className="oc-top">
            {chart.ceo ? (
              <button type="button" className={`oc-ceo${selectedId === chart.ceo.id ? ' on' : ''}`} onClick={() => select(chart.ceo.id)}>
                <span className="oc-avatar" aria-hidden="true">
                  {initialsOf(chart.ceo.name)}
                </span>
                <span className="oc-person-text">
                  <strong>{chart.ceo.id === meId ? 'Tú' : chart.ceo.name}</strong>
                  <span>CEO{chart.ceo.id === meId ? ` · ${chart.ceo.name}` : ''}</span>
                </span>
              </button>
            ) : (
              <div className="oc-ceo">
                <span className="oc-person-text">
                  <strong>CEO</strong>
                </span>
              </div>
            )}
          </div>

          <Arrow tone="dark" />

          <section className="oc-board" aria-label="Equipo directivo">
            <h2>Equipo directivo</h2>
            <div className="oc-board-grid">
              {chart.board.map((slot) => (
                <div key={slot.id} className={`oc-slot slot-${slot.id}`}>
                  {slot.people.length === 0 ? (
                    <EmptyCard label={slot.label} />
                  ) : (
                    slot.people.map((p) => <PersonCard key={p.id} person={p} selected={selectedId === p.id} onSelect={select} />)
                  )}
                </div>
              ))}
            </div>
            {chart.boardOther.length > 0 && (
              <div className="oc-board-other">
                <span className="oc-muted">Sin puesto (se elige en Accesos):</span>
                {chart.boardOther.map((p) => (
                  <PersonCard key={p.id} person={p} selected={selectedId === p.id} onSelect={select} />
                ))}
              </div>
            )}
          </section>

          <div className="oc-links">
            <Arrow tone="blue" label="jefe: Director" className="to-director" />
            <Arrow tone="green" label="jefe: Coordinador" className="to-coordinator" />
          </div>

          <div className="oc-bottom">
            <section className="oc-group blue" aria-label="Áreas">
              <h2>Áreas · dependen del Director</h2>
              {areas.length === 0 ? (
                <p className="oc-muted">Todas las áreas están vacías.</p>
              ) : (
                <div className="oc-areas">
                  {areas.map((a) => (
                    <div key={a.id} className={`oc-area${a.people.length === 0 ? ' empty' : ''}`} style={{ '--oc-color': a.color }}>
                      <div className="oc-area-head">
                        <span className="oc-area-dot" aria-hidden="true" />
                        <strong>{a.name}</strong>
                        <span className="oc-count">{a.people.length}</span>
                      </div>
                      {a.people.length === 0 ? (
                        <p className="oc-muted">{query ? 'Nadie con ese nombre' : 'Sin personas todavía'}</p>
                      ) : (
                        a.people.map((p) => <PersonCard key={p.id} person={p} color={a.color} selected={selectedId === p.id} onSelect={select} />)
                      )}
                    </div>
                  ))}
                </div>
              )}
              {chart.noArea.length > 0 && (
                <div className="oc-board-other">
                  <span className="oc-muted">Sin área (se elige en Accesos):</span>
                  {chart.noArea.map((p) => (
                    <PersonCard key={p.id} person={p} selected={selectedId === p.id} onSelect={select} />
                  ))}
                </div>
              )}
            </section>

            <section className="oc-group green" aria-label="Profesores">
              <h2>Profesores · dependen del Coordinador</h2>
              {chart.teachers.length === 0 ? (
                <p className="oc-muted">{query ? 'Nadie con ese nombre.' : 'Sin profesores todavía.'}</p>
              ) : (
                <div className="oc-teachers">
                  {chart.teachers.map((p) => (
                    <PersonCard key={p.id} person={p} color="#16a34a" selected={selectedId === p.id} onSelect={select} />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {selected && (
        <aside className="oc-strip" aria-label={`Ficha de ${selected.name}`}>
          <span className="oc-avatar big" aria-hidden="true">
            {initialsOf(selected.name)}
          </span>
          <div className="oc-strip-main">
            <strong>{selected.name}</strong>
            <span>{positionOf(selected)}</span>
          </div>
          <dl className="oc-strip-facts">
            <div>
              <dt>Zona horaria</dt>
              <dd>{zoneShort(selected.timeZone)}</dd>
            </div>
            {selected.role !== 'ceo' && (
              <div>
                <dt>En el equipo</dt>
                <dd>{sinceText(selected.memberSince) || '—'}</dd>
              </div>
            )}
            <div>
              <dt>Horas este mes</dt>
              <dd>{selected.monthMinutes === null ? '—' : formatMinutes(selected.monthMinutes)}</dd>
            </div>
            {selected.role !== 'ceo' && (
              <div>
                <dt>Responde a</dt>
                <dd>{bossText(selected, chart.people)}</dd>
              </div>
            )}
          </dl>
          <div className="oc-strip-actions">
            {onMessage && selected.id !== meId && (
              <button type="button" className="oc-btn primary" onClick={() => onMessage(selected.id)}>
                <MessageCircle size={15} strokeWidth={1.75} />
                Enviar mensaje
              </button>
            )}
            {onOpenFicha && selected.linkedTeamId && (
              <button type="button" className="oc-btn" onClick={() => onOpenFicha(selected.linkedTeamId)}>
                <UserRound size={15} strokeWidth={1.75} />
                Ver ficha
              </button>
            )}
            <button type="button" className="oc-icon-btn" onClick={() => setSelectedId(null)} aria-label="Cerrar">
              <X size={18} strokeWidth={1.75} />
            </button>
          </div>
        </aside>
      )}
    </div>
  )
}

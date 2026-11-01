import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Download, Plus, Search } from 'lucide-react'
import FinanceChart from './FinanceChart.jsx'
import MovementModal from './MovementModal.jsx'
import { keyOf } from '../../lib/sharedCalendar'
import { listAreasForTasks } from '../../lib/teamWork'
import {
  CATEGORIES,
  KINDS,
  KIND_LABEL,
  budgetState,
  categoryLabel,
  centsToInput,
  dayLabel,
  downloadCsv,
  euros,
  filterMovements,
  financeLog,
  financeSummary,
  listMovements,
  monthLabel,
  movementsCsv,
  parseEuros,
  setBudget,
  totals,
} from '../../lib/finance'
import '../shared/SharedCalendar.css'
import '../team/TeamWork.css'
import './Finance.css'

const ACTION_LABEL = { alta: 'Alta', edicion: 'Edición', borrado: 'Borrado', presupuesto: 'Presupuesto' }

function Stat({ label, value, tone = '' }) {
  return (
    <div className={`fn-stat ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

// Presupuesto por área: barra de lo gastado este mes (naranja desde el 80 %, rojo si se pasa).
// Con canEdit, se cambian los importes.
function Budgets({ client, budgets, canEdit, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const start = () => {
    setDraft(Object.fromEntries(budgets.map((b) => [b.area, b.monthly === null || b.monthly === undefined ? '' : centsToInput(b.monthly)])))
    setError(null)
    setEditing(true)
  }
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      for (const b of budgets) {
        const text = (draft[b.area] || '').trim()
        const cents = text === '' ? null : text === '0' ? 0 : parseEuros(text)
        if (text !== '' && cents === null) throw new Error(`Presupuesto no válido en ${b.area_name}.`)
        if (cents !== (b.monthly ?? null)) await setBudget(client, b.area, cents)
      }
      setEditing(false)
      onSaved()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  const shown = editing ? budgets : budgets.filter((b) => b.monthly !== null && b.monthly !== undefined)
  return (
    <section className="fn-card">
      <h2>
        Presupuesto por área (este mes)
        {canEdit && !editing && (
          <button type="button" className="sc-btn" onClick={start}>
            Cambiar
          </button>
        )}
      </h2>
      {shown.length === 0 ? (
        <p className="sc-zone">Ningún área tiene presupuesto.</p>
      ) : (
        <ul className="fn-budgets">
          {shown.map((b) => {
            const st = budgetState(b)
            return (
              <li key={b.area}>
                <span className="fn-budget-name">{b.area_name}</span>
                {editing ? (
                  <input
                    type="text"
                    inputMode="decimal"
                    value={draft[b.area] || ''}
                    placeholder="Sin presupuesto"
                    aria-label={`Presupuesto mensual de ${b.area_name} (€)`}
                    onChange={(e) => setDraft((d) => ({ ...d, [b.area]: e.target.value }))}
                  />
                ) : (
                  <>
                    <span className="fn-bar" aria-hidden="true">
                      <span className={st.level} style={{ width: `${Math.min(100, Math.round(st.ratio * 100))}%` }} />
                    </span>
                    <span className={`fn-budget-num ${st.level}`}>
                      {st.level !== 'ok' && <AlertTriangle size={13} strokeWidth={2} aria-label={st.level === 'over' ? 'Se ha pasado' : 'Más del 80 %'} />}
                      {euros(b.spent)} de {euros(b.monthly)}
                    </span>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {error && <p className="sc-message error">{error}</p>}
      {editing && (
        <div className="sc-actions">
          <button type="button" className="sc-btn" onClick={() => setEditing(false)} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="sc-btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar presupuestos'}
          </button>
        </div>
      )}
    </section>
  )
}

/**
 * «Finanzas»: resumen del mes, últimos 6 meses, gastos por categoría, presupuesto por área, lista
 * de movimientos con filtros y CSV, e historial de cambios. me: { role, area }. Finanzas y la ceo
 * editan; Directivo y «Ver como» (asId + readOnly), solo ven.
 */
export default function FinanceView({ client, me, zone, asId = null, readOnly = false }) {
  const canEdit = !readOnly && (me.role === 'ceo' || me.area === 'finanzas')
  const today = keyOf(new Date(), zone)
  const [month, setMonth] = useState(today.slice(0, 7))
  const [summary, setSummary] = useState(null)
  const [movements, setMovements] = useState(null)
  const [areas, setAreas] = useState([])
  const [log, setLog] = useState(null)
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)
  const [filters, setFilters] = useState({ kind: '', category: '', area: '', query: '' })
  const [open, setOpen] = useState(null) // { movement } (null: nuevo)
  const [showLog, setShowLog] = useState(false)

  useEffect(() => {
    if (!client) return
    let active = true
    Promise.all([financeSummary(client, `${month}-01`, asId), listMovements(client, asId), listAreasForTasks(client)]).then(
      ([s, rows, areaRows]) => {
        if (!active) return
        setSummary(s)
        setMovements(rows || [])
        setAreas(areaRows || [])
        setError(null)
      },
      (err) => active && setError(err.message),
    )
    return () => {
      active = false
    }
  }, [client, month, asId, reload])

  useEffect(() => {
    if (!client || !showLog) return
    let active = true
    financeLog(client, asId).then(
      (rows) => active && setLog(rows || []),
      (err) => active && setError(err.message),
    )
    return () => {
      active = false
    }
  }, [client, asId, showLog, reload])

  const refresh = () => setReload((n) => n + 1)
  const setFilter = (patch) => setFilters((f) => ({ ...f, ...patch }))
  const filtered = useMemo(() => filterMovements(movements || [], { ...filters, month }), [movements, filters, month])
  const filteredTotals = totals(filtered)
  const categories = filters.kind ? CATEGORIES[filters.kind] : [...CATEGORIES.ingreso, ...CATEGORIES.gasto.filter((c) => c.id !== 'otro')]
  const maxCategory = Math.max(1, ...(summary?.by_category || []).map((c) => Number(c.cents)))

  return (
    <div className="sc-root">
      <div className="sc-head">
        <div>
          <h1>Finanzas</h1>
          <p className="sc-zone">{canEdit ? 'Ingresos, gastos y presupuestos del equipo.' : 'Solo lectura.'}</p>
        </div>
        <button type="button" className="sc-btn-primary" disabled={!canEdit || !client} onClick={() => setOpen({ movement: null })}>
          <Plus size={16} strokeWidth={2} />
          Nuevo movimiento
        </button>
      </div>

      <div className="fn-pickers">
        <label>
          <span>Mes</span>
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </label>
        {month !== today.slice(0, 7) && (
          <button type="button" className="sc-btn" onClick={() => setMonth(today.slice(0, 7))}>
            Este mes
          </button>
        )}
      </div>

      {error ? (
        <p className="sc-message error">{error}</p>
      ) : !client ? (
        <p className="sc-message">No hay nada aquí.</p>
      ) : !summary || !movements ? (
        <p className="sc-message">Cargando…</p>
      ) : (
        <>
          <section className="fn-stats" aria-label={`Resumen de ${monthLabel(`${month}-01`)}`}>
            <Stat label={`Ingresos de ${monthLabel(`${month}-01`)}`} value={euros(summary.income)} />
            <Stat label="Gastos del mes" value={euros(summary.expense)} />
            <Stat label="Saldo del mes" value={euros(summary.balance)} tone={summary.balance < 0 ? 'negative' : ''} />
            <Stat label="Saldo total acumulado" value={euros(summary.total_balance)} tone={summary.total_balance < 0 ? 'negative' : ''} />
          </section>

          <div className="fn-grid">
            <section className="fn-card wide">
              <FinanceChart months={summary.months || []} />
            </section>

            <section className="fn-card">
              <h2>Gastos por categoría (este mes)</h2>
              {(summary.by_category || []).length === 0 ? (
                <p className="sc-zone">Ningún gasto este mes.</p>
              ) : (
                <ul className="fn-categories">
                  {summary.by_category.map((c) => (
                    <li key={c.category} title={`${categoryLabel('gasto', c.category)}: ${euros(c.cents)}`}>
                      <span>{categoryLabel('gasto', c.category)}</span>
                      <span className="fn-bar" aria-hidden="true">
                        <span className="fn-s2" style={{ width: `${Math.max(2, Math.round((Number(c.cents) / maxCategory) * 100))}%` }} />
                      </span>
                      <span className="fn-num">{euros(c.cents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <Budgets client={client} budgets={summary.budgets || []} canEdit={canEdit} onSaved={refresh} />
          </div>

          <section className="fn-card">
            <h2>Movimientos de {monthLabel(`${month}-01`)}</h2>
            <div className="fn-filters">
              <select value={filters.kind} onChange={(e) => setFilter({ kind: e.target.value, category: '' })} aria-label="Tipo">
                <option value="">Ingresos y gastos</option>
                {KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}s
                  </option>
                ))}
              </select>
              <select value={filters.category} onChange={(e) => setFilter({ category: e.target.value })} aria-label="Categoría">
                <option value="">Todas las categorías</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <select value={filters.area} onChange={(e) => setFilter({ area: e.target.value })} aria-label="Área">
                <option value="">Todas las áreas</option>
                <option value="none">Sin área</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <label className="fn-search">
                <Search size={14} strokeWidth={1.75} />
                <input type="search" value={filters.query} onChange={(e) => setFilter({ query: e.target.value })} placeholder="Buscar…" aria-label="Buscar" />
              </label>
              <button type="button" className="sc-btn" disabled={filtered.length === 0} onClick={() => downloadCsv(`finanzas-${month}.csv`, movementsCsv(filtered))}>
                <Download size={14} strokeWidth={1.75} />
                Exportar CSV
              </button>
            </div>
            {filtered.length === 0 ? (
              <p className="sc-zone">Ningún movimiento con esos filtros.</p>
            ) : (
              <>
                <p className="sc-zone">
                  {filtered.length} {filtered.length === 1 ? 'movimiento' : 'movimientos'} · ingresos {euros(filteredTotals.income)} · gastos {euros(filteredTotals.expense)} · saldo{' '}
                  {euros(filteredTotals.balance)}
                </p>
                <ul className="fn-movements">
                  {filtered.map((m) => (
                    <li key={m.id}>
                      <button type="button" onClick={() => setOpen({ movement: m })}>
                        <span className="fn-mov-main">
                          <strong>{m.concept}</strong>
                          <span className="fn-mov-meta">
                            {dayLabel(m.day)} · {KIND_LABEL[m.kind]} · {categoryLabel(m.kind, m.category)}
                            {m.area_name && ` · ${m.area_name}`}
                            {m.contact_name && ` · ${m.contact_name}`}
                          </span>
                        </span>
                        <span className={`fn-amount ${m.kind}`}>
                          {m.kind === 'ingreso' ? '+' : '−'}
                          {euros(m.amount_cents)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="fn-card">
            <h2>
              Historial de cambios
              <button type="button" className="sc-btn" onClick={() => setShowLog((v) => !v)}>
                {showLog ? 'Ocultar' : 'Ver'}
              </button>
            </h2>
            {showLog &&
              (!log ? (
                <p className="sc-zone">Cargando…</p>
              ) : log.length === 0 ? (
                <p className="sc-zone">Todavía no hay cambios.</p>
              ) : (
                <ul className="fn-log">
                  {log.map((l) => {
                    const data = l.after || l.before || {}
                    return (
                      <li key={l.id}>
                        <span className="fn-mov-meta">
                          {new Date(l.at).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · {l.who_name || '—'}
                        </span>
                        <span>
                          <strong>{ACTION_LABEL[l.action] || l.action}</strong>{' '}
                          {l.action === 'presupuesto'
                            ? `de ${areas.find((a) => a.id === l.area)?.name || l.area}: ${l.before ? euros(l.before.monthly_cents) : 'sin presupuesto'} → ${l.after ? euros(l.after.monthly_cents) : 'sin presupuesto'}`
                            : `«${data.concept || ''}» (${KIND_LABEL[data.kind] || ''}, ${euros(data.amount_cents)}${l.action === 'edicion' && l.before && l.before.amount_cents !== l.after?.amount_cents ? `; antes ${euros(l.before.amount_cents)}` : ''})`}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              ))}
          </section>
        </>
      )}

      {open && (
        <MovementModal
          client={client}
          movement={open.movement}
          areas={areas}
          canEdit={canEdit}
          today={today}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

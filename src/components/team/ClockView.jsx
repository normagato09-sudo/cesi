import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, LogIn, LogOut, Trash2 } from 'lucide-react'
import ClockFixModal from './ClockFixModal.jsx'
import { addDaysKey, dayLabel, daysRange, hhmmOf, keyOf, mondayOf, weekLabel } from '../../lib/sharedCalendar'
import {
  clockIn,
  clockOut,
  deleteClockEntry,
  entriesByDay,
  entryMinutes,
  errorText,
  formatMinutes,
  listClockEntries,
  listOldOpenEntries,
  openEntry,
  summarizeByPerson,
} from '../../lib/teamWork'
import '../shared/SharedCalendar.css'
import './TeamWork.css'

const DAY_MS = 24 * 60 * 60 * 1000

function EntryRow({ entry, zone, showName, onFix, onDelete }) {
  const start = new Date(entry.clock_in)
  const end = entry.clock_out ? new Date(entry.clock_out) : null
  return (
    <div className="tw-entry">
      <div className="tw-entry-main">
        <span className="tw-entry-time">
          {showName && `${entry.name} · `}
          {hhmmOf(start, zone)} – {end ? hhmmOf(end, zone) : <span className="tw-open">sin salida</span>}
          {end && ` · ${formatMinutes(entryMinutes(entry))}`}
        </span>
        {entry.summary && <span className="tw-entry-text">{entry.summary}</span>}
        {entry.fix_note && (
          <span className="tw-entry-text">
            Corregido{entry.fixed_by_name ? ` por ${entry.fixed_by_name}` : ''}: {entry.fix_note}
          </span>
        )}
      </div>
      {(onFix || onDelete) && (
        <span className="tw-entry-actions">
          {onFix && (
            <button type="button" className="sc-btn" onClick={() => onFix(entry)}>
              Corregir
            </button>
          )}
          {onDelete && (
            <button type="button" className="sc-btn sc-icon-btn tw-delete" onClick={() => onDelete(entry)} aria-label="Eliminar fichaje" title="Eliminar fichaje">
              <Trash2 size={15} strokeWidth={1.75} />
            </button>
          )}
        </span>
      )}
    </div>
  )
}

function DayList({ entries, zone, showName, onFix, onDelete = null }) {
  const byDay = entriesByDay(entries, zone)
  if (byDay.size === 0) return <p className="sc-message">No hay fichajes esta semana.</p>
  return [...byDay.entries()].map(([key, list]) => (
    <section key={key} className="tw-day">
      <h3>{dayLabel(key)}</h3>
      {list.map((e) => (
        <EntryRow key={e.id} entry={e} zone={zone} showName={showName} onFix={onFix && e.can_fix ? onFix : null} onDelete={onDelete} />
      ))}
    </section>
  ))
}

// Fichaje. «Mi fichaje» (persona de equipo): fichar entrada / salida (con «¿Qué has hecho?») y sus
// fichajes de la semana con las horas. «Equipo» (Directivo y la ceo): los de todos, con el
// resumen semanal por persona. me: { id, role, area, boss }. asId + readOnly: «Ver como».
export default function ClockView({ client, me, zone, asId = null, readOnly = false }) {
  const tabs = [...(me.role === 'equipo' ? [{ id: 'mine', label: 'Mi fichaje' }] : []), ...(me.boss ? [{ id: 'team', label: 'Equipo' }] : [])]
  const [tab, setTab] = useState(tabs[0]?.id || 'mine')
  const [monday, setMonday] = useState(() => mondayOf(keyOf(new Date(), zone)))
  const [data, setData] = useState(null) // { week, recent, old }
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)
  const [summary, setSummary] = useState('')
  const [askSummary, setAskSummary] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [fixing, setFixing] = useState(null)

  useEffect(() => {
    if (!client) return
    let active = true
    const { start, end } = daysRange(monday, 7, zone)
    const now = Date.now()
    const all = tab === 'team'
    Promise.all([
      listClockEntries(client, start, end, { all, asId }),
      all ? Promise.resolve([]) : listClockEntries(client, new Date(now - DAY_MS), new Date(now + 60000), { asId }),
      all ? Promise.resolve([]) : listOldOpenEntries(client, asId),
    ]).then(
      ([week, recent, old]) => {
        if (!active) return
        setData({ tab, week: week || [], recent: recent || [], old: old || [] })
        setError(null)
      },
      (err) => active && setError(errorText(err)),
    )
    return () => {
      active = false
    }
  }, [client, monday, zone, tab, asId, reload])

  const refresh = useCallback(() => setReload((n) => n + 1), [])
  // Sin cliente (vista previa de un ejemplo, sin cuenta): vacío.
  const shown = useMemo(() => (client ? (data?.tab === tab ? data : null) : { tab, week: [], recent: [], old: [] }), [client, data, tab])
  const open = shown ? openEntry(shown.recent) : null
  const total = useMemo(() => (shown ? shown.week.reduce((n, e) => n + entryMinutes(e), 0) : 0), [shown])
  const people = useMemo(() => (shown && tab === 'team' ? summarizeByPerson(shown.week) : []), [shown, tab])

  const act = async (action) => {
    setBusy(true)
    setActionError(null)
    try {
      await action()
      setSummary('')
      setAskSummary(false)
      refresh()
    } catch (err) {
      setActionError(errorText(err))
    }
    setBusy(false)
  }

  const onFix = readOnly ? null : setFixing

  // Eliminar un fichaje: solo la ceo (no en «Ver como»), con confirmación.
  const onDelete =
    me.role === 'ceo' && !readOnly
      ? async (entry) => {
          const who = entry.name ? ` de ${entry.name}` : ''
          const when = `${dayLabel(keyOf(new Date(entry.clock_in), zone))} a las ${hhmmOf(new Date(entry.clock_in), zone)}`
          if (!window.confirm(`¿Seguro que quieres eliminar el fichaje${who} del ${when}? No se puede deshacer.`)) return
          setActionError(null)
          try {
            await deleteClockEntry(client, entry.id)
            refresh()
          } catch (err) {
            setActionError(errorText(err))
          }
        }
      : null

  return (
    <div className="sc-root">
      <div className="sc-head">
        <div>
          <h1>{me.role === 'ceo' ? 'Fichajes' : 'Fichaje'}</h1>
          <p className="sc-zone">Horas en tu zona</p>
        </div>
      </div>

      {tabs.length > 1 && (
        <div className="tw-filters" role="tablist" aria-label="Fichajes">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`tw-filter${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {error && <p className="sc-message error">{error}</p>}

      {tab === 'mine' && shown && (
        <div className="tw-clock-card">
          {open ? (
            <>
              <p className="tw-clock-state">
                Has fichado la entrada a las <strong>{hhmmOf(new Date(open.clock_in), zone)}</strong>.
              </p>
              {askSummary ? (
                <label className="sc-field" style={{ width: '100%' }}>
                  <span>¿Qué has hecho?</span>
                  <textarea value={summary} maxLength={2000} onChange={(e) => setSummary(e.target.value)} autoFocus />
                </label>
              ) : null}
              <div className="sc-toolbar">
                {askSummary && (
                  <button type="button" className="sc-btn" onClick={() => setAskSummary(false)} disabled={busy}>
                    Cancelar
                  </button>
                )}
                <button
                  type="button"
                  className="sc-btn-primary tw-clock-btn out"
                  disabled={readOnly || busy || (askSummary && !summary.trim())}
                  onClick={() => (askSummary ? act(() => clockOut(client, summary)) : setAskSummary(true))}
                >
                  <LogOut size={20} strokeWidth={2} />
                  Fichar salida
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="tw-clock-state">No has fichado la entrada.</p>
              <button type="button" className="sc-btn-primary tw-clock-btn" disabled={readOnly || busy} onClick={() => act(() => clockIn(client))}>
                <LogIn size={20} strokeWidth={2} />
                Fichar entrada
              </button>
            </>
          )}
          {actionError && <p className="sc-message error">{actionError}</p>}
        </div>
      )}

      {tab === 'mine' &&
        shown?.old.map((o) => (
          <div key={o.id} className="sc-message error">
            Tienes una entrada sin salida del {dayLabel(keyOf(new Date(o.clock_in), zone))} a las {hhmmOf(new Date(o.clock_in), zone)}.{' '}
            {o.can_fix && onFix ? (
              <button type="button" className="sc-btn" onClick={() => onFix(o)}>
                Corregir
              </button>
            ) : (
              'Pide a Directivo que la corrija.'
            )}
          </div>
        ))}

      <div className="sc-toolbar">
        <button type="button" className="sc-btn" onClick={() => setMonday(mondayOf(keyOf(new Date(), zone)))}>
          Esta semana
        </button>
        <button type="button" className="sc-btn sc-icon-btn" onClick={() => setMonday(addDaysKey(monday, -7))} aria-label="Semana anterior">
          <ChevronLeft size={16} />
        </button>
        <button type="button" className="sc-btn sc-icon-btn" onClick={() => setMonday(addDaysKey(monday, 7))} aria-label="Semana siguiente">
          <ChevronRight size={16} />
        </button>
        <span className="sc-week-label">{weekLabel(monday)}</span>
      </div>

      {!shown ? (
        !error && <p className="sc-message">Cargando…</p>
      ) : tab === 'mine' ? (
        <>
          <p className="tw-total">Total de la semana: {formatMinutes(total)}</p>
          <DayList entries={shown.week} zone={zone} onFix={onFix} />
        </>
      ) : (
        <>
          {people.length === 0 ? (
            <p className="sc-message">Nadie ha fichado esta semana.</p>
          ) : (
            <table className="tw-table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th className="num">Horas</th>
                  <th className="num">Fichajes</th>
                  <th className="num">Sin salida</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.profileId}>
                    <td>{p.name}</td>
                    <td className="num">{formatMinutes(p.minutes)}</td>
                    <td className="num">{p.count}</td>
                    <td className={`num${p.open ? ' tw-open' : ''}`}>{p.open || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {actionError && <p className="sc-message error">{actionError}</p>}
          <DayList entries={shown.week} zone={zone} showName onFix={onFix} onDelete={onDelete} />
        </>
      )}

      {fixing && (
        <ClockFixModal
          client={client}
          entry={fixing}
          zone={zone}
          boss={me.boss}
          onClose={() => setFixing(null)}
          onSaved={() => {
            setFixing(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

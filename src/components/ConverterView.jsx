import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ArrowLeftRight, Globe, History, TriangleAlert } from 'lucide-react'
import TimeZoneSelect from './TimeZoneSelect.jsx'
import {
  SPAIN_ZONE,
  convertWallTime,
  formatInZone,
  formatOffsetDiff,
  pad2,
  zoneLabel,
  zonePlace,
  zoneValue,
} from '../lib/timezones'
import { getRecentZones, rememberZone } from '../lib/converterRecent'
import './ConverterView.css'

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const MINUTES = [0, 15, 30, 45]
const REASONABLE_START = 8 * 60
const REASONABLE_END = 20 * 60

function dayShiftLabel(shift) {
  if (shift === 1) return 'día siguiente'
  if (shift === -1) return 'día anterior'
  if (shift > 1) return `${shift} días después`
  if (shift < -1) return `${-shift} días antes`
  return null
}

function isReasonable({ hour, minute }) {
  const m = hour * 60 + minute
  return m >= REASONABLE_START && m <= REASONABLE_END
}

export default function ConverterView() {
  const now = new Date()
  const [date, setDate] = useState(format(now, 'yyyy-MM-dd'))
  const [hour, setHour] = useState(now.getHours())
  const [minute, setMinute] = useState(0)
  const [origin, setOrigin] = useState(zoneValue(SPAIN_ZONE, 'ES'))
  const [recent, setRecent] = useState(() => getRecentZones())
  const [destination, setDestination] = useState(() => recent[0] || null)

  const time = `${pad2(hour)}:${pad2(minute)}`

  const result = useMemo(
    () => (destination && date ? convertWallTime({ date, time, fromZone: origin.timeZone, toZone: destination.timeZone }) : null),
    [date, time, origin, destination],
  )

  const table = useMemo(() => {
    if (!destination || !date) return []
    return HOURS.map((h) => {
      const r = convertWallTime({ date, time: `${pad2(h)}:00`, fromZone: origin.timeZone, toZone: destination.timeZone })
      return { hour: h, ...r, reasonable: isReasonable(r.to) }
    })
  }, [date, origin, destination])

  const chooseDestination = (value) => {
    setDestination(value)
    if (value) setRecent(rememberZone(value))
  }

  const swap = () => {
    if (!destination) return
    setOrigin(destination)
    setDestination(origin)
  }

  const originPlace = zonePlace(origin.timeZone)
  const destPlace = destination ? zonePlace(destination.timeZone) : ''
  const shiftLabel = result ? dayShiftLabel(result.dayShift) : null

  return (
    <div className="converter-view">
      <div className="converter-header">
        <h1>
          <Globe size={19} strokeWidth={1.75} />
          Conversor de hora
        </h1>
      </div>

      <div className="converter-content">
        <section className="converter-card converter-form">
          <div className="converter-row">
            <label className="converter-field">
              <span>Fecha</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
            <div className="converter-field">
              <span id="converter-time-label">Hora</span>
              <div className="converter-time" role="group" aria-labelledby="converter-time-label">
                <select value={hour} onChange={(e) => setHour(Number(e.target.value))} aria-label="Hora">
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {pad2(h)}
                    </option>
                  ))}
                </select>
                <span aria-hidden="true">:</span>
                <select value={minute} onChange={(e) => setMinute(Number(e.target.value))} aria-label="Minutos">
                  {MINUTES.map((m) => (
                    <option key={m} value={m}>
                      {pad2(m)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="converter-zones">
            <TimeZoneSelect label="Desde" value={origin} onChange={(v) => v && setOrigin(v)} />
            <button
              type="button"
              className="converter-swap"
              onClick={swap}
              disabled={!destination}
              aria-label="Intercambiar origen y destino"
              title="Intercambiar origen y destino"
            >
              <ArrowLeftRight size={16} strokeWidth={1.75} />
            </button>
            <TimeZoneSelect
              label="País de destino"
              value={destination}
              onChange={chooseDestination}
              allowEmpty
              emptyLabel="Elige un país"
            />
          </div>

          {recent.length > 0 && (
            <div className="converter-recent">
              <span className="converter-recent-label">
                <History size={13} strokeWidth={1.75} />
                Recientes
              </span>
              {recent.map((r) => (
                <button
                  key={r.timeZone}
                  type="button"
                  className={`converter-chip${destination?.timeZone === r.timeZone ? ' active' : ''}`}
                  onClick={() => chooseDestination(r)}
                >
                  {zoneLabel(r.timeZone)}
                </button>
              ))}
            </div>
          )}
        </section>

        {!destination && (
          <section className="converter-card converter-empty">
            <p>Elige un país de destino para ver a qué hora es allí.</p>
          </section>
        )}

        {result && (
          <section className="converter-card converter-result" aria-live="polite">
            <p className="converter-result-from">
              {time} en {originPlace}
              {!result.exists && ' (no existe ese día)'} son
            </p>
            <p className="converter-result-time">{result.time}</p>
            <p className="converter-result-date">
              {formatInZone(result.instant, destination.timeZone, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}{' '}
              en {destPlace}
            </p>
            <div className="converter-badges">
              <span className="converter-badge">{result.diffMinutes === 0 ? 'Misma hora' : `${formatOffsetDiff(result.diffMinutes)} respecto a ${originPlace}`}</span>
              {shiftLabel && <span className="converter-badge day">{shiftLabel}</span>}
              {isReasonable(result.to) ? (
                <span className="converter-badge ok">Horario razonable</span>
              ) : (
                <span className="converter-badge late">Fuera de horario razonable</span>
              )}
            </div>
            {!result.exists && (
              <p className="converter-warning">
                <TriangleAlert size={14} strokeWidth={1.75} />
                Las {time} no existen en {originPlace} ese día por el cambio de hora. Se muestra la hora equivalente
                justo después del cambio.
              </p>
            )}
          </section>
        )}

        {destination && table.length > 0 && (
          <section className="converter-card converter-table-card">
            <h2>Las 24 horas del día</h2>
            <p className="converter-table-hint">Se marcan las horas entre las 08:00 y las 20:00 en {destPlace}.</p>
            <table className="converter-table">
              <thead>
                <tr>
                  <th scope="col">{originPlace}</th>
                  <th scope="col">{destPlace}</th>
                  <th scope="col">
                    <span className="sr-only">Horario razonable</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {table.map((row) => (
                  <tr key={row.hour} className={`${row.reasonable ? 'reasonable' : ''}${row.hour === hour ? ' current' : ''}`}>
                    <td>{pad2(row.hour)}:00</td>
                    <td>
                      {row.time}
                      {row.dayShift !== 0 && (
                        <span className="converter-shift" title={dayShiftLabel(row.dayShift)}>
                          {row.dayShift > 0 ? `+${row.dayShift}` : row.dayShift} d
                        </span>
                      )}
                    </td>
                    <td>{row.reasonable && <span className="converter-dot" title="Horario razonable para quedar" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeft, BarChart3, ChevronLeft, ChevronRight, NotebookPen, Printer } from 'lucide-react'
import ContactAvatar from './ContactAvatar.jsx'
import { colorForEvent } from '../lib/eventStyle'
import { notesOf, notesPreview } from '../lib/notes'
import { dateKey } from '../lib/recurrence'
import { computeReport, formatCountDelta, formatHours, formatMsDelta, meetingEvolution } from '../lib/weeklyReport'
import { PERIOD_KINDS, isCurrentPeriod, periodLabel, periodOf, shiftPeriod, validateCustom } from '../lib/reportPeriods'
import { ParticipantList } from './Participant.jsx'
import './ReportView.css'

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const WEEKDAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const EVOLUTION_UNITS = [
  { id: 'week', label: 'Semanas', count: 12 },
  { id: 'month', label: 'Meses', count: 12 },
]

const meetingsText = (n) => `${n} reunión${n === 1 ? '' : 'es'}`
const hourRange = (h) => `${String(h).padStart(2, '0')}:00–${String(h + 1).padStart(2, '0')}:00`

// "+2 respecto al mes anterior". `goodWhenUp` solo cambia el tono, nunca el texto.
function Delta({ text, value, note, goodWhenUp = null }) {
  let tone = 'neutral'
  if (value !== 0 && goodWhenUp !== null) tone = value > 0 === goodWhenUp ? 'good' : 'bad'
  return (
    <span className={`report-delta ${tone}`}>
      {text} <span className="report-delta-note">{note}</span>
    </span>
  )
}

function StatCard({ label, value, delta }) {
  return (
    <div className="report-stat">
      <span className="report-stat-label">{label}</span>
      <span className="report-stat-value">{value}</span>
      {delta}
    </div>
  )
}

// Gráfico de columnas de una sola serie (horas en reuniones). items: [{ key, label, sub, ms, summary }].
// Las columnas de `highlight` van en el tono fuerte. Solo una lleva el valor encima, la mayor de
// las destacadas (si no, se pisarían en el móvil); el resto, al pasar el ratón o para lectores de pantalla.
function ColumnChart({ items, highlight = [], ariaLabel, dense = false }) {
  const max = Math.max(...items.map((d) => d.ms), 1)
  const labelIndex = highlight.reduce((best, i) => (best === null || items[i].ms > items[best].ms ? i : best), null)
  return (
    <div
      className={`report-days${dense ? ' dense' : ''}`}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      role="list"
      aria-label={ariaLabel}
    >
      {items.map((d, i) => {
        const strong = highlight.includes(i)
        return (
          <div key={d.key} className={`report-day${strong ? ' busiest' : ''}`} role="listitem" aria-label={d.summary} title={d.summary}>
            <div className="report-day-track">
              {i === labelIndex && d.ms > 0 && <span className="report-day-value">{formatHours(d.ms)}</span>}
              <span className="report-day-tip" aria-hidden="true">
                {formatHours(d.ms)}
              </span>
              <div className="report-day-bar" style={{ height: d.ms > 0 ? `${Math.max(3, (d.ms / max) * 100)}%` : 0 }} />
            </div>
            <span className="report-day-label">
              {d.label}
              {d.sub && <span className="report-day-date">{d.sub}</span>}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// Reparto (departamento, grupo…): barras horizontales en un solo tono.
function Breakdown({ title, rows, empty, dotColor, note }) {
  const total = Math.max(0, ...rows.map((r) => r.ms))
  return (
    <section className="report-card">
      <h2 className="report-card-title">{title}</h2>
      {rows.length === 0 ? (
        <p className="report-empty">{empty}</p>
      ) : (
        <ul className="report-breakdown">
          {rows.map((r) => (
            <li key={r.key} title={`${r.label}: ${meetingsText(r.count)}, ${formatHours(r.ms)}`}>
              <span className="report-breakdown-label">
                {dotColor?.(r) && <span className="report-dot" style={{ background: dotColor(r) }} />}
                {r.label}
              </span>
              <span className="report-breakdown-value">
                {formatHours(r.ms)} · {r.count}
              </span>
              <span className="report-breakdown-track">
                <span className="report-breakdown-bar" style={{ width: `${total > 0 ? Math.max(2, (r.ms / total) * 100) : 0}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {note && rows.length > 0 && <p className="report-note">{note}</p>}
    </section>
  )
}

// Selector de periodo: esta semana, este mes, últimos 3 meses o personalizado (desde / hasta).
function PeriodPicker({ kind, custom, error, onKind, onCustom }) {
  return (
    <div className="report-toolbar">
      <div className="report-seg" role="group" aria-label="Periodo">
        {PERIOD_KINDS.map((k) => (
          <button key={k.id} type="button" className={kind === k.id ? 'active' : ''} aria-pressed={kind === k.id} onClick={() => onKind(k.id)}>
            {k.label}
          </button>
        ))}
      </div>
      {kind === 'custom' && (
        <div className="report-custom">
          <label>
            <span>Desde</span>
            <input type="date" value={custom.from} max={custom.to || undefined} onChange={(e) => onCustom({ ...custom, from: e.target.value })} />
          </label>
          <label>
            <span>Hasta</span>
            <input type="date" value={custom.to} min={custom.from || undefined} onChange={(e) => onCustom({ ...custom, to: e.target.value })} />
          </label>
          {error && (
            <span className="report-custom-error" role="alert">
              {error}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export default function ReportView({ rawEvents, workingHours, contacts, groups, now, onOpenEvent, onBack }) {
  const [period, setPeriod] = useState(() => periodOf('week', now))
  // Fechas del periodo personalizado mientras se eligen (se aplican cuando son válidas).
  const [custom, setCustom] = useState(() => ({ from: dateKey(period.start), to: dateKey(new Date(period.end.getTime() - 1)) }))
  const [kind, setKind] = useState('week')
  const [evolutionUnit, setEvolutionUnit] = useState('week')
  const [showMeetings, setShowMeetings] = useState(false)

  const report = useMemo(
    () => computeReport(rawEvents, { ...period, workingHours, contacts, groups }),
    [rawEvents, period, workingHours, contacts, groups],
  )
  const unit = EVOLUTION_UNITS.find((u) => u.id === evolutionUnit)
  // Termina en la semana (o el mes) del último día del periodo elegido.
  const evolution = useMemo(
    () => meetingEvolution(rawEvents, { unit: unit.id, until: new Date(period.end.getTime() - 1), count: unit.count }),
    [rawEvents, unit, period],
  )

  const customError = kind === 'custom' ? validateCustom(custom) : null
  const isWeek = period.kind === 'week'
  const isCurrent = isCurrentPeriod(period, now)
  const note = period.previousLabel

  const choosePeriod = (id) => {
    setKind(id)
    setShowMeetings(false)
    if (id !== 'custom') setPeriod(periodOf(id, now))
    else if (!validateCustom(custom)) setPeriod(periodOf('custom', null, custom))
  }
  const changeCustom = (next) => {
    setCustom(next)
    if (!validateCustom(next)) setPeriod(periodOf('custom', null, next))
  }
  const shift = (dir) => {
    const next = shiftPeriod(period, dir)
    setPeriod(next)
    if (next.kind === 'custom') setCustom({ from: dateKey(next.start), to: dateKey(new Date(next.end.getTime() - 1)) })
  }
  const backToNow = () => setPeriod(periodOf(period.kind === 'custom' ? 'week' : period.kind, now))

  const dayItems = report.days.map((d, i) => ({
    key: dateKey(d.date),
    label: DAY_LABELS[i],
    sub: format(d.date, 'd'),
    ms: d.ms,
    summary: `${format(d.date, 'EEEE d', { locale: es })}: ${formatHours(d.ms)} en ${meetingsText(d.meetings)}`,
  }))
  const weekdayItems = report.byWeekday.map((d, i) => ({
    key: String(i),
    label: DAY_LABELS[i],
    ms: d.ms,
    summary: `${WEEKDAY_NAMES[i]}: ${formatHours(d.ms)} en ${meetingsText(d.meetings)} (${d.days} ${WEEKDAY_NAMES[i]}${d.days === 1 ? '' : 's'} en el periodo)`,
  }))
  const hourItems = report.byHour.map((h) => ({
    key: String(h.hour),
    label: String(h.hour),
    ms: h.ms,
    summary: `${hourRange(h.hour)}: ${formatHours(h.ms)} en reuniones`,
  }))
  const evolutionItems = evolution.map((b) => ({
    key: dateKey(b.start),
    label: unit.id === 'week' ? format(b.start, 'd') : format(b.start, 'MMM', { locale: es }),
    sub: unit.id === 'week' ? format(b.start, 'MMM', { locale: es }) : format(b.start, 'yy'),
    ms: b.ms,
    summary: `${unit.id === 'week' ? `Semana del ${format(b.start, "d 'de' MMMM", { locale: es })}` : format(b.start, 'MMMM yyyy', { locale: es })}: ${formatHours(b.ms)} en ${meetingsText(b.meetings)}`,
  }))
  // Columnas de la evolución que caen dentro del periodo elegido.
  const inPeriod = evolution.map((b, i) => (b.start < period.end && b.end > period.start ? i : null)).filter((i) => i !== null)
  const evolutionAvg = evolution.reduce((sum, b) => sum + b.ms, 0) / evolution.length

  const busiestDay = report.busiestDayIndex === null ? null : report.days[report.busiestDayIndex]
  const busiestWeekday = report.busiestWeekdayIndex
  const busiestHour = report.busiestHourIndex === null ? null : report.byHour[report.busiestHourIndex]
  const listOpen = isWeek || showMeetings

  return (
    <div className="report-view">
      <header className="report-header">
        <div className="report-header-title">
          {onBack && (
            <button type="button" className="report-back" onClick={onBack}>
              <ArrowLeft size={16} strokeWidth={1.75} />
              Inicio
            </button>
          )}
          <h1>
            <BarChart3 size={18} strokeWidth={1.75} />
            Resumen
          </h1>
          <p className="report-week">{periodLabel(period)}</p>
        </div>
        <div className="report-header-actions">
          <div className="header-nav-group">
            <button type="button" className="header-icon-btn" onClick={() => shift(-1)} aria-label="Periodo anterior" disabled={!!customError}>
              <ChevronLeft size={17} strokeWidth={1.75} />
            </button>
            <button type="button" className="header-icon-btn" onClick={() => shift(1)} aria-label="Periodo siguiente" disabled={!!customError}>
              <ChevronRight size={17} strokeWidth={1.75} />
            </button>
          </div>
          {period.kind !== 'custom' && (
            <button type="button" className="header-btn" onClick={backToNow} disabled={isCurrent}>
              {PERIOD_KINDS.find((k) => k.id === period.kind).label}
            </button>
          )}
          <button type="button" className="header-action-btn" onClick={() => window.print()}>
            <Printer size={15} strokeWidth={1.75} />
            <span>Imprimir / guardar PDF</span>
          </button>
        </div>
      </header>

      <div className="report-body">
        <PeriodPicker kind={kind} custom={custom} error={customError} onKind={choosePeriod} onCustom={changeCustom} />

        <div className="report-stats">
          <StatCard
            label="Reuniones"
            value={report.count}
            delta={<Delta text={formatCountDelta(report.delta.count)} value={report.delta.count} note={note} />}
          />
          <StatCard
            label="Horas en reuniones"
            value={formatHours(report.meetingMs)}
            delta={<Delta text={formatMsDelta(report.delta.meetingMs)} value={report.delta.meetingMs} note={note} />}
          />
          <StatCard
            label="Horas libres en mi horario"
            value={formatHours(report.freeMs)}
            delta={<Delta text={formatMsDelta(report.delta.freeMs)} value={report.delta.freeMs} note={note} goodWhenUp />}
          />
        </div>

        <section className="report-card">
          <div className="report-card-head">
            <h2 className="report-card-title">Evolución de las horas en reuniones</h2>
            <div className="report-seg small" role="group" aria-label="Agrupar por">
              {EVOLUTION_UNITS.map((u) => (
                <button key={u.id} type="button" className={evolutionUnit === u.id ? 'active' : ''} aria-pressed={evolutionUnit === u.id} onClick={() => setEvolutionUnit(u.id)}>
                  {u.label}
                </button>
              ))}
            </div>
          </div>
          <ColumnChart
            items={evolutionItems}
            highlight={inPeriod}
            ariaLabel={`Horas en reuniones de las últimas ${unit.count} ${unit.id === 'week' ? 'semanas' : 'meses'}`}
          />
          <p className="report-caption">
            Últimas {unit.count} {unit.id === 'week' ? 'semanas' : 'meses'}: media de {formatHours(evolutionAvg)} por{' '}
            {unit.id === 'week' ? 'semana' : 'mes'}. Destacado, el periodo elegido.
          </p>
        </section>

        {isWeek ? (
          <section className="report-card">
            <h2 className="report-card-title">Horas en reuniones por día</h2>
            <ColumnChart items={dayItems} highlight={report.busiestDayIndex === null ? [] : [report.busiestDayIndex]} ariaLabel="Horas en reuniones por día" />
            <p className="report-caption">
              {busiestDay ? `Día más cargado: ${format(busiestDay.date, 'EEEE d', { locale: es })} (${formatHours(busiestDay.ms)}).` : 'Sin reuniones esta semana.'}
            </p>
          </section>
        ) : (
          <section className="report-card">
            <h2 className="report-card-title">Días de la semana más cargados</h2>
            <ColumnChart items={weekdayItems} highlight={busiestWeekday === null ? [] : [busiestWeekday]} ariaLabel="Horas en reuniones por día de la semana" />
            <p className="report-caption">
              {busiestWeekday === null
                ? 'Sin reuniones en este periodo.'
                : `Suma de todo el periodo. El día más cargado es el ${WEEKDAY_NAMES[busiestWeekday]} (${formatHours(report.byWeekday[busiestWeekday].ms)}).`}
            </p>
          </section>
        )}

        <section className="report-card">
          <h2 className="report-card-title">Franjas horarias más cargadas</h2>
          <ColumnChart
            items={hourItems}
            highlight={report.busiestHourIndex === null ? [] : [report.busiestHourIndex]}
            ariaLabel="Horas en reuniones por franja horaria"
            dense
          />
          <p className="report-caption">
            {busiestHour
              ? `Horas en reuniones en cada franja de una hora, sumando todo el periodo. La más cargada: ${hourRange(busiestHour.hour)} (${formatHours(busiestHour.ms)}).`
              : 'Sin reuniones en este periodo.'}
          </p>
        </section>

        <div className="report-grid">
          <Breakdown
            title="Por departamento"
            rows={report.byDepartment}
            empty="Sin reuniones."
            note="Una reunión con varios departamentos cuenta en cada uno, así que la suma puede superar el total."
          />
          <Breakdown title="Por grupo de contactos" rows={report.byGroup} empty="Ninguna reunión con contactos de un grupo." dotColor={(r) => r.color} />
          <section className="report-card">
            <h2 className="report-card-title">Por persona</h2>
            {report.byPerson.length === 0 ? (
              <p className="report-empty">Ninguna reunión con contactos.</p>
            ) : (
              <ol className="report-people">
                {report.byPerson.map((r) => (
                  <li key={r.key}>
                    <ContactAvatar name={r.label} photo={r.contact?.photo} size="sm" />
                    <span className="report-people-name">{r.label}</span>
                    <span className="report-people-value">
                      {meetingsText(r.count)} · {formatHours(r.ms)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* Al imprimir, la lista solo sale si está desplegada. */}
        <section className={`report-card${listOpen ? '' : ' report-print-hidden'}`}>
          <div className="report-card-head">
            <h2 className="report-card-title">{isWeek ? 'Reuniones de la semana' : 'Reuniones del periodo'}</h2>
            {!isWeek && report.meetings.length > 0 && (
              <button type="button" className="report-more" aria-expanded={showMeetings} onClick={() => setShowMeetings((v) => !v)}>
                {showMeetings ? 'Ocultar' : `Ver las ${report.meetings.length} reuniones`}
              </button>
            )}
          </div>
          {report.meetings.length === 0 ? (
            <p className="report-empty">No hay reuniones en este periodo.</p>
          ) : (
            listOpen && (
              <ul className="report-meetings">
                {report.meetings.map((ev) => {
                  const notes = notesOf(ev).trim()
                  return (
                    <li key={ev.id}>
                      <button type="button" className="report-meeting" onClick={() => onOpenEvent(ev)}>
                        <span className="report-meeting-mark" style={{ background: colorForEvent(ev) }} />
                        <span className="report-meeting-when">
                          {format(ev.start, isWeek ? 'EEE d' : 'EEE d MMM', { locale: es })}
                          <span>
                            {format(ev.start, 'HH:mm')}–{format(ev.end, 'HH:mm')}
                          </span>
                        </span>
                        <span className="report-meeting-text">
                          <span className="report-meeting-title">{ev.title}</span>
                          <ParticipantList item={ev} contacts={contacts} start={ev.start} end={ev.end} size="compact" />
                          <span className={`report-meeting-notes${notes ? '' : ' empty'}`}>
                            {notes && <NotebookPen size={12} strokeWidth={2} />}
                            {notes ? notesPreview(notes, 140) : 'Sin notas'}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )
          )}
        </section>
      </div>
    </div>
  )
}

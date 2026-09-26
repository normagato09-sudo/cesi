import { useMemo, useState } from 'react'
import { addWeeks, format, isSameDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { BarChart3, ChevronLeft, ChevronRight, NotebookPen, Printer } from 'lucide-react'
import ContactAvatar from './ContactAvatar.jsx'
import { colorForEvent } from '../lib/eventStyle'
import { notesOf, notesPreview } from '../lib/notes'
import {
  computeWeeklyReport,
  formatCountDelta,
  formatHours,
  formatMsDelta,
  weekStartOf,
} from '../lib/weeklyReport'
import { ParticipantList } from './Participant.jsx'
import './ReportView.css'

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function weekLabel(start, end) {
  const last = new Date(end.getTime() - 1)
  if (start.getMonth() === last.getMonth()) {
    return `${format(start, 'd')}–${format(last, "d 'de' MMMM yyyy", { locale: es })}`
  }
  if (start.getFullYear() === last.getFullYear()) {
    return `${format(start, "d 'de' MMMM", { locale: es })} – ${format(last, "d 'de' MMMM yyyy", { locale: es })}`
  }
  return `${format(start, "d MMM yyyy", { locale: es })} – ${format(last, "d MMM yyyy", { locale: es })}`
}

// "+2 respecto a la semana anterior". `goodWhenUp` solo cambia el tono, nunca el texto.
function Delta({ text, value, goodWhenUp = null }) {
  let tone = 'neutral'
  if (value !== 0 && goodWhenUp !== null) tone = value > 0 === goodWhenUp ? 'good' : 'bad'
  return (
    <span className={`report-delta ${tone}`}>
      {text} <span className="report-delta-note">vs. semana anterior</span>
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

// Horas en reuniones por día: barras verticales, el día más cargado destacado.
function DayChart({ days, busiestIndex }) {
  const max = Math.max(...days.map((d) => d.ms), 1)
  return (
    <div className="report-days" role="list" aria-label="Horas en reuniones por día">
      {days.map((d, i) => {
        const busiest = i === busiestIndex
        const summary = `${format(d.date, "EEEE d", { locale: es })}: ${formatHours(d.ms)} en ${d.meetings} reunión${d.meetings === 1 ? '' : 'es'}`
        return (
          <div key={i} className={`report-day${busiest ? ' busiest' : ''}`} role="listitem" aria-label={summary} title={summary}>
            <div className="report-day-track">
              {busiest && <span className="report-day-value">{formatHours(d.ms)}</span>}
              <span className="report-day-tip" aria-hidden="true">
                {formatHours(d.ms)} · {d.meetings}
              </span>
              <div className="report-day-bar" style={{ height: d.ms > 0 ? `${Math.max(3, (d.ms / max) * 100)}%` : 0 }} />
            </div>
            <span className="report-day-label">
              {DAY_LABELS[i]}
              <span className="report-day-date">{format(d.date, 'd')}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

// Reparto (categoría, etiqueta, grupo): barras horizontales en un solo tono.
function Breakdown({ title, rows, total, empty, dotColor }) {
  return (
    <section className="report-card">
      <h2 className="report-card-title">{title}</h2>
      {rows.length === 0 ? (
        <p className="report-empty">{empty}</p>
      ) : (
        <ul className="report-breakdown">
          {rows.map((r) => (
            <li key={r.key} title={`${r.label}: ${r.count} reunión${r.count === 1 ? '' : 'es'}, ${formatHours(r.ms)}`}>
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
    </section>
  )
}

export default function ReportView({ rawEvents, workingHours, weeklyAvailability = [], contacts, groups, projects = [], now, onOpenEvent }) {
  const [weekStart, setWeekStart] = useState(() => weekStartOf(now))
  const report = useMemo(
    () => computeWeeklyReport(rawEvents, { weekStart, workingHours, weeklyAvailability, contacts, groups, projects }),
    [rawEvents, weekStart, workingHours, weeklyAvailability, contacts, groups, projects],
  )
  const isThisWeek = isSameDay(weekStart, weekStartOf(now))
  const maxOf = (rows) => Math.max(0, ...rows.map((r) => r.ms))

  return (
    <div className="report-view">
      <header className="report-header">
        <div className="report-header-title">
          <h1>
            <BarChart3 size={18} strokeWidth={1.75} />
            Resumen semanal
          </h1>
          <p className="report-week">{weekLabel(report.weekStart, report.weekEnd)}</p>
        </div>
        <div className="report-header-actions">
          <div className="header-nav-group">
            <button type="button" className="header-icon-btn" onClick={() => setWeekStart((w) => addWeeks(w, -1))} aria-label="Semana anterior">
              <ChevronLeft size={17} strokeWidth={1.75} />
            </button>
            <button type="button" className="header-icon-btn" onClick={() => setWeekStart((w) => addWeeks(w, 1))} aria-label="Semana siguiente">
              <ChevronRight size={17} strokeWidth={1.75} />
            </button>
          </div>
          <button type="button" className="header-btn" onClick={() => setWeekStart(weekStartOf(new Date()))} disabled={isThisWeek}>
            Esta semana
          </button>
          <button type="button" className="header-action-btn" onClick={() => window.print()}>
            <Printer size={15} strokeWidth={1.75} />
            <span>Imprimir / guardar PDF</span>
          </button>
        </div>
      </header>

      <div className="report-body">
        <div className="report-stats">
          <StatCard
            label="Reuniones"
            value={report.count}
            delta={<Delta text={formatCountDelta(report.delta.count)} value={report.delta.count} />}
          />
          <StatCard
            label="Horas en reuniones"
            value={formatHours(report.meetingMs)}
            delta={<Delta text={formatMsDelta(report.delta.meetingMs)} value={report.delta.meetingMs} />}
          />
          <StatCard
            label="Horas libres en mi horario"
            value={formatHours(report.freeMs)}
            delta={<Delta text={formatMsDelta(report.delta.freeMs)} value={report.delta.freeMs} goodWhenUp />}
          />
        </div>

        <section className="report-card">
          <h2 className="report-card-title">Horas en reuniones por día</h2>
          <DayChart days={report.days} busiestIndex={report.busiestDayIndex} />
          <p className="report-caption">
            {report.busiestDayIndex === null
              ? 'Sin reuniones esta semana.'
              : `Día más cargado: ${format(report.days[report.busiestDayIndex].date, "EEEE d", { locale: es })} (${formatHours(report.days[report.busiestDayIndex].ms)}).`}
          </p>
        </section>

        <div className="report-grid">
          <Breakdown
            title="Por categoría"
            rows={report.byCategory}
            total={maxOf(report.byCategory)}
            empty="Sin reuniones."
            dotColor={(r) => colorForEvent({ category: r.key })}
          />
          <Breakdown
            title="Por proyecto"
            rows={report.byProject}
            total={maxOf(report.byProject)}
            empty="Sin reuniones."
            dotColor={(r) => r.color || '#9aa1ac'}
          />
          <Breakdown title="Por etiqueta" rows={report.byTag} total={maxOf(report.byTag)} empty="Ninguna reunión con etiquetas." />
          <Breakdown
            title="Por grupo de contactos"
            rows={report.byGroup}
            total={maxOf(report.byGroup)}
            empty="Ninguna reunión con contactos de un grupo."
            dotColor={(r) => r.color}
          />
          <section className="report-card">
            <h2 className="report-card-title">Con quién me he reunido más</h2>
            {report.topContacts.length === 0 ? (
              <p className="report-empty">Ninguna reunión con contactos.</p>
            ) : (
              <ol className="report-people">
                {report.topContacts.map((r) => (
                  <li key={r.key}>
                    <ContactAvatar name={r.label} photo={r.contact?.photo} size="sm" />
                    <span className="report-people-name">{r.label}</span>
                    <span className="report-people-value">
                      {r.count} reunión{r.count === 1 ? '' : 'es'} · {formatHours(r.ms)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <section className="report-card">
          <h2 className="report-card-title">Reuniones de la semana</h2>
          {report.meetings.length === 0 ? (
            <p className="report-empty">No hay reuniones esta semana.</p>
          ) : (
            <ul className="report-meetings">
              {report.meetings.map((ev) => {
                const notes = notesOf(ev).trim()
                return (
                  <li key={ev.id}>
                    <button type="button" className="report-meeting" onClick={() => onOpenEvent(ev)}>
                      <span className="report-meeting-mark" style={{ background: colorForEvent(ev) }} />
                      <span className="report-meeting-when">
                        {format(ev.start, 'EEE d', { locale: es })}
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
          )}
        </section>
      </div>
    </div>
  )
}

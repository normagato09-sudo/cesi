import { useState } from 'react'
import { euros, monthLabel, monthShort } from '../../lib/finance'

// Ingresos (azul, serie 1) y gastos (naranja, serie 2) de los últimos 6 meses: barras agrupadas
// con un solo eje, leyenda, la cifra del mes al pasar por encima y una tabla con los mismos datos.
// months: [{ month: 'AAAA-MM-01', income, expense }] en céntimos, del más antiguo al actual.
const W = 560
const H = 200
const PAD = { top: 12, right: 8, bottom: 26, left: 8 }
const SERIES = [
  { id: 'income', label: 'Ingresos', className: 'fn-s1' },
  { id: 'expense', label: 'Gastos', className: 'fn-s2' },
]

export default function FinanceChart({ months }) {
  const [hover, setHover] = useState(null) // índice del mes
  const [asTable, setAsTable] = useState(false)
  const max = Math.max(1, ...months.flatMap((m) => [Number(m.income), Number(m.expense)]))
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const slot = plotW / months.length
  const barW = Math.min(26, (slot - 14) / 2)
  const y = (v) => PAD.top + plotH - (Number(v) / max) * plotH

  return (
    <figure className="fn-chart">
      <figcaption>
        <span>Últimos 6 meses</span>
        <span className="fn-legend" aria-hidden={asTable}>
          {SERIES.map((s) => (
            <span key={s.id}>
              <i className={s.className} />
              {s.label}
            </span>
          ))}
        </span>
        <button type="button" className="fn-link" onClick={() => setAsTable((v) => !v)}>
          {asTable ? 'Ver gráfico' : 'Ver tabla'}
        </button>
      </figcaption>

      {asTable ? (
        <table className="fn-table">
          <thead>
            <tr>
              <th>Mes</th>
              <th className="num">Ingresos</th>
              <th className="num">Gastos</th>
              <th className="num">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month}>
                <td>{monthLabel(m.month)}</td>
                <td className="num">{euros(m.income)}</td>
                <td className="num">{euros(m.expense)}</td>
                <td className="num">{euros(Number(m.income) - Number(m.expense))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="fn-plot" onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ingresos y gastos de los últimos 6 meses (la tabla tiene las cifras)">
            <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} className="fn-axis" />
            {months.map((m, i) => {
              const cx = PAD.left + slot * i + slot / 2
              return (
                <g key={m.month}>
                  {hover === i && <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={plotH} className="fn-hover-band" />}
                  {SERIES.map((s, k) => {
                    const v = Number(m[s.id])
                    const top = y(v)
                    const h = PAD.top + plotH - top
                    const x = k === 0 ? cx - barW - 1 : cx + 1
                    return h > 0 ? <path key={s.id} className={s.className} d={roundedTop(x, top, barW, h, Math.min(4, h, barW / 2))} /> : null
                  })}
                  <text x={cx} y={H - 8} className="fn-tick" textAnchor="middle">
                    {monthShort(m.month)}
                  </text>
                  {/* Zona de hover más grande que las barras. */}
                  <rect x={PAD.left + slot * i} y={0} width={slot} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${monthLabel(m.month)}: ingresos ${euros(m.income)}, gastos ${euros(m.expense)}`} />
                </g>
              )
            })}
          </svg>
          {hover !== null && (
            <div className="fn-tooltip" style={{ left: `${((PAD.left + slot * hover + slot / 2) / W) * 100}%` }} role="status">
              <strong>{monthLabel(months[hover].month)}</strong>
              {SERIES.map((s) => (
                <span key={s.id}>
                  <i className={s.className} />
                  {s.label}: {euros(months[hover][s.id])}
                </span>
              ))}
              <span>Saldo: {euros(Number(months[hover].income) - Number(months[hover].expense))}</span>
            </div>
          )}
        </div>
      )}
    </figure>
  )
}

// Barra con las esquinas de arriba redondeadas y la base recta sobre el eje.
function roundedTop(x, y, w, h, r) {
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`
}

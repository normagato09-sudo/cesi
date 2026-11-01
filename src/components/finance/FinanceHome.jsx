import { useEffect, useState } from 'react'
import { KIND_LABEL, dayLabel, euros, listMovements, monthBalance } from '../../lib/finance'
import '../team/TeamWork.css'
import './Finance.css'

function useFinanceHome(client, asId, withMovements) {
  const [state, setState] = useState(null)
  useEffect(() => {
    if (!client) return
    let active = true
    Promise.all([monthBalance(client, asId), withMovements ? listMovements(client, asId) : []]).then(
      ([balance, rows]) => active && setState({ balance, latest: (rows || []).slice(0, 5), error: null }),
      (err) => active && setState({ balance: null, latest: [], error: err.message }),
    )
    return () => {
      active = false
    }
  }, [client, asId, withMovements])
  return state
}

function Balance({ balance }) {
  return (
    <p className="fn-home-balance">
      <span>Ingresos {euros(balance.income)}</span>
      <span>Gastos {euros(balance.expense)}</span>
      <strong className={balance.balance < 0 ? 'tw-overdue' : undefined}>Saldo del mes {euros(balance.balance)}</strong>
    </p>
  )
}

// En el Inicio de Finanzas: el saldo del mes y los últimos movimientos. En el de Directivo
// (withMovements false): solo el saldo del mes. asId: «Ver como». onOpen: ir a Finanzas.
export default function FinanceHomeCard({ client, asId = null, withMovements = true, onOpen = null }) {
  const state = useFinanceHome(client, asId, withMovements)
  if (!client) return null
  const Main = onOpen ? 'button' : 'div'
  return (
    <section className="member-panel-access tw-home-tasks">
      <h2>Finanzas</h2>
      {!state ? (
        <p className="sc-zone">Cargando…</p>
      ) : state.error ? (
        <p className="sc-message error">{state.error}</p>
      ) : (
        <>
          <Balance balance={state.balance} />
          {withMovements &&
            (state.latest.length === 0 ? (
              <p className="sc-zone">Todavía no hay movimientos.</p>
            ) : (
              <ul className="tw-list">
                {state.latest.map((m) => (
                  <li key={m.id} className="tw-task">
                    <Main {...(onOpen ? { type: 'button', onClick: onOpen } : {})} className="tw-task-main">
                      <span className="tw-task-title">{m.concept}</span>
                      <span className="tw-task-meta">
                        <span>{dayLabel(m.day)}</span>
                        <span>{KIND_LABEL[m.kind]}</span>
                        <span>
                          {m.kind === 'ingreso' ? '+' : '−'}
                          {euros(m.amount_cents)}
                        </span>
                      </span>
                    </Main>
                  </li>
                ))}
              </ul>
            ))}
        </>
      )}
    </section>
  )
}

import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import VacanciesBoard from '../VacanciesBoard.jsx'
import { canUseVacancies, deleteTeamVacancy, listTeamVacancies, saveTeamVacancy, vacancyErrorText } from '../../lib/vacancyBoard'
import '../chat/Messages.css'

// «No tienes acceso»: sin cargar ningún dato.
export function NoVacancyAccess() {
  return (
    <div className="ms-root ms-private">
      <Lock size={28} strokeWidth={1.5} />
      <p className="ms-private-title">No tienes acceso</p>
      <p>Vacantes es solo para la dirección, Directivo y RRHH.</p>
    </div>
  )
}

/**
 * «Vacantes» para Directivo y RRHH (parte 38): la misma pantalla que la ceo, con los datos de sus
 * funciones (que comprueban el área). Otra área: «No tienes acceso», sin pedir nada. readOnly
 * («Ver como»): se ve, pero no se guarda.
 */
export default function TeamVacancies({ client, area, readOnly = false }) {
  const allowed = canUseVacancies(area)
  const [list, setList] = useState(null)
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!client || !allowed) return
    let active = true
    listTeamVacancies(client).then(
      (rows) => {
        if (!active) return
        setList(rows)
        setError(null)
      },
      (err) => active && setError(vacancyErrorText(err)),
    )
    return () => {
      active = false
    }
  }, [client, allowed, reload])

  if (!allowed) return <NoVacancyAccess />

  const guard = (fn) => async (...args) => {
    if (readOnly) throw new Error('En «Ver como» no se puede cambiar nada.')
    try {
      await fn(...args)
    } catch (err) {
      throw new Error(vacancyErrorText(err), { cause: err })
    }
    setReload((n) => n + 1)
  }

  return (
    <VacanciesBoard
      vacancies={list}
      error={error}
      onSave={guard((id, data) => saveTeamVacancy(client, id, data))}
      onDelete={guard((id) => deleteTeamVacancy(client, id))}
    />
  )
}

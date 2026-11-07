import { useEffect, useState } from 'react'
import VacanciesBoard from '../VacanciesBoard.jsx'
import OpenVacancies from '../OpenVacancies.jsx'
import { canUseVacancies, deleteTeamVacancy, listTeamVacancies, saveTeamVacancy, vacancyErrorText } from '../../lib/vacancyBoard'

// Directivo y RRHH: la misma pantalla que la ceo (parte 38), con los postulantes de cada vacante.
function ManageVacancies({ client, readOnly }) {
  const [list, setList] = useState(null)
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!client) return
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
  }, [client, reload])

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
      applicantsClient={readOnly ? null : client}
      onSave={guard((id, data) => saveTeamVacancy(client, id, data))}
      onDelete={guard((id) => deleteTeamVacancy(client, id))}
    />
  )
}

/**
 * «Vacantes» en la app del equipo: Directivo y RRHH las gestionan (con sus postulantes); el resto
 * del equipo ve las abiertas y se postula (parte 39). meId: su cuenta. readOnly («Ver como»).
 */
export default function TeamVacancies({ client, area, meId, readOnly = false }) {
  return canUseVacancies(area) ? <ManageVacancies client={client} readOnly={readOnly} /> : <OpenVacancies client={client} meId={meId} readOnly={readOnly} />
}

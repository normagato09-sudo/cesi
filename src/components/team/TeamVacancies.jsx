import { useEffect, useState } from 'react'
import VacanciesBoard from '../VacanciesBoard.jsx'
import OpenVacancies from '../OpenVacancies.jsx'
import { canUseVacancies, deleteTeamVacancy, listTeamVacancies, saveTeamVacancy, vacancyErrorText } from '../../lib/vacancyBoard'
import { canSeeApplications } from '../../lib/vacancyApplications'

// Directivo y RRHH: la misma pantalla que la ceo (parte 38). Las candidaturas, solo RRHH (parte 40).
function ManageVacancies({ client, readOnly, withApplications }) {
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
      applicantsClient={readOnly || !withApplications ? null : client}
      onSave={guard((id, data) => saveTeamVacancy(client, id, data))}
      onDelete={guard((id) => deleteTeamVacancy(client, id))}
    />
  )
}

/**
 * «Vacantes» en la app del equipo: Directivo y RRHH las gestionan (RRHH, además, con sus
 * candidaturas); el resto del equipo ve las abiertas y se postula (parte 40). me: { name, country,
 * email, discord } de su perfil. readOnly («Ver como»).
 */
export default function TeamVacancies({ client, area, me = null, readOnly = false }) {
  return canUseVacancies(area) ? (
    <ManageVacancies client={client} readOnly={readOnly} withApplications={canSeeApplications(area)} />
  ) : (
    <OpenVacancies client={client} me={me} readOnly={readOnly} />
  )
}

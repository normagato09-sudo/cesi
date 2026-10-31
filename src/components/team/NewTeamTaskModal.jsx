import { useEffect, useState } from 'react'
import Modal from '../shared/Modal.jsx'
import TaskEditModal from './TaskEditModal.jsx'
import { errorText, listAreasForTasks } from '../../lib/teamWork'

// «Convertir en tarea» desde el acta de una reunión: el formulario de tarea del equipo con el
// texto ya puesto (se elige persona, área y fecha). Carga antes las áreas.
export default function NewTeamTaskModal({ client, me, prefill, onClose, onSaved }) {
  const [areas, setAreas] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    listAreasForTasks(client).then(
      (rows) => active && setAreas(rows || []),
      (err) => active && setError(errorText(err)),
    )
    return () => {
      active = false
    }
  }, [client])

  if (!areas) {
    return (
      <Modal title="Nueva tarea" onClose={onClose}>
        <p className={`sc-message${error ? ' error' : ''}`}>{error || 'Cargando…'}</p>
      </Modal>
    )
  }
  return <TaskEditModal client={client} me={me} prefill={prefill} areas={areas} onClose={onClose} onSaved={onSaved} />
}

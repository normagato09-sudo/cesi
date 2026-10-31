import { UserRound } from 'lucide-react'
import './ProfileReminder.css'

// Aviso en Inicio de la ceo mientras no haya completado su perfil (no le bloquea la app).
export default function ProfileReminder({ onOpen }) {
  return (
    <div className="profile-reminder" role="status">
      <UserRound size={18} strokeWidth={1.75} aria-hidden="true" />
      <p>Completa tu perfil para que el equipo y los alumnos vean cuándo estás disponible</p>
      <button type="button" onClick={onOpen}>
        Completar mi perfil
      </button>
    </div>
  )
}

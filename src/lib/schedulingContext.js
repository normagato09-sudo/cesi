import { createContext, useContext } from 'react'

// Datos que necesitan los buscadores de huecos y formularios en cualquier parte de la app:
// { rawEvents, workingHours, preferences, contacts, addContact }
export const SchedulingContext = createContext(null)

export function useScheduling() {
  const value = useContext(SchedulingContext)
  if (!value) throw new Error('useScheduling debe usarse dentro de SchedulingContext.')
  return value
}

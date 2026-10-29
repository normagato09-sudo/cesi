import { createContext, useContext } from 'react'

// «Ver como» (ver ViewAs.jsx): { open() } para el botón del menú; null si no está disponible
// (sin sincronización, o en una vista previa).
export const ViewAsContext = createContext(null)

export function useViewAs() {
  return useContext(ViewAsContext)
}

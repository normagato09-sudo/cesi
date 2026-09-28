import { createContext, useContext } from 'react'

// Enlaces de confirmación de asistencia (hook useMeetingInvites) para cualquier parte de la app.
export const InvitesContext = createContext(null)

const EMPTY = { enabled: false, ready: false, invites: [], notices: [] }

export function useInvites() {
  return useContext(InvitesContext) || EMPTY
}

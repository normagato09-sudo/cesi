import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSupabase } from '../lib/sync/client'
import {
  fetchInvites,
  fetchOccurrenceInvites,
  guestToContactMoves,
  insertInvites,
  inviteMoves,
  missingInviteRows,
  occurrenceRef,
  reconcilePlan,
  subscribeInvites,
  updateInvite,
} from '../lib/meetingInvites'

const noticeId = (n) => `${n.eventId}|${n.key}`

/**
 * Enlaces de confirmación de asistencia (tabla meeting_invites) de las reuniones del usuario:
 * se cargan al iniciar sesión, llegan en tiempo real y se mantienen al día con las reuniones
 * (se desactivan si la reunión, el día o el participante ya no están, y cambian de hora con ella).
 * Solo con la sincronización activa; sin ella, `enabled` es false y no hay enlaces.
 */
export function useMeetingInvites({ sync, synced, rawEvents, contacts }) {
  const userId = sync?.engine?.userId || null
  const [client, setClient] = useState(null)
  const [invites, setInvites] = useState(() => new Map()) // token → fila
  const [loadedFor, setLoadedFor] = useState(null) // userId cuyos enlaces ya se han cargado
  const [notices, setNotices] = useState([]) // reuniones que han cambiado de hora: hay que reenviar
  const inFlight = useRef(new Set()) // tokens con un cambio aún sin guardar en la nube

  useEffect(() => {
    if (!userId) return
    let active = true
    let unsubscribe = () => {}
    getSupabase().then(async (supabase) => {
      if (!active || !supabase) return
      setClient(supabase)
      unsubscribe = subscribeInvites(supabase, userId, (row) => setInvites((prev) => new Map(prev).set(row.token, row)))
      try {
        const rows = await fetchInvites(supabase)
        if (!active) return
        setInvites((prev) => {
          const next = new Map(prev)
          for (const row of rows) next.set(row.token, row)
          return next
        })
        setLoadedFor(userId)
      } catch {
        // Sin la tabla o sin conexión: la app funciona igual, sin confirmaciones.
      }
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [userId])

  const list = useMemo(() => [...invites.values()], [invites])

  // Cambia filas aquí y en la nube. `changes`: [{ token, ...campos }].
  const applyChanges = useCallback(
    (changes) => {
      if (changes.length === 0) return
      setInvites((prev) => {
        const next = new Map(prev)
        for (const { token, ...patch } of changes) if (next.has(token)) next.set(token, { ...next.get(token), ...patch })
        return next
      })
      if (!client) return
      for (const { token } of changes) inFlight.current.add(token)
      // En orden: al mover días de una serie, el orden evita chocar con el índice de un enlace por día.
      ;(async () => {
        for (const { token, ...patch } of changes) {
          try {
            await updateInvite(client, token, patch)
          } catch {
            // Se reintenta en la próxima comprobación (al cambiar las reuniones o al volver a abrir la app).
          }
          inFlight.current.delete(token)
        }
      })()
    },
    [client],
  )

  // Comprobación con las reuniones: solo con los datos de la nube ya descargados, para no
  // desactivar enlaces de una reunión que aún no ha llegado a este dispositivo.
  const ready = !!client && loadedFor === userId && synced
  useEffect(() => {
    if (!ready) return
    const plan = reconcilePlan(
      list.filter((i) => !inFlight.current.has(i.token)),
      rawEvents,
      contacts,
    )
    if (plan.revoke.length === 0 && plan.reschedule.length === 0) return
    // Fuera del efecto: el estado cambia en cuanto se guardan los cambios.
    queueMicrotask(() => {
      applyChanges([...plan.revoke.map((token) => ({ token, revoked: true })), ...plan.reschedule])
      if (plan.notices.length > 0) {
        setNotices((prev) => {
          const ids = new Set(plan.notices.map(noticeId))
          return [...prev.filter((n) => !ids.has(noticeId(n))), ...plan.notices]
        })
      }
    })
  }, [ready, list, rawEvents, contacts, applyChanges])

  // Enlaces de la ocurrencia para sus participantes (`entries` de participantEntries): reutiliza
  // los que ya hay (también los creados desde otro dispositivo) y crea los que faltan.
  const ensureInvites = useCallback(
    async (occurrence, entries) => {
      if (!client) throw new Error('Para pedir confirmación hace falta la sincronización con Supabase.')
      const existing = await fetchOccurrenceInvites(client, occurrenceRef(occurrence))
      let rows = missingInviteRows(existing, occurrence, entries)
      let created = []
      try {
        created = await insertInvites(client, rows)
      } catch (err) {
        // Otro dispositivo los ha creado a la vez: se usan los suyos.
        if (err.code !== '23505') throw err
        rows = []
      }
      const fresh = rows.length ? [...existing, ...created] : await fetchOccurrenceInvites(client, occurrenceRef(occurrence))
      setInvites((prev) => {
        const next = new Map(prev)
        for (const row of fresh) next.set(row.token, row)
        return next
      })
      return fresh
    },
    [client],
  )

  // Al guardar un cambio de hora en una reunión (ver inviteMoves).
  const moveInvites = useCallback((change) => applyChanges(inviteMoves(list, change)), [applyChanges, list])

  const moveGuestToContact = useCallback(
    (eventId, guest, contactId, key) => applyChanges(guestToContactMoves(list, eventId, guest, contactId, key)),
    [applyChanges, list],
  )

  const dismissNotice = useCallback((notice) => setNotices((prev) => prev.filter((n) => noticeId(n) !== noticeId(notice))), [])

  return useMemo(
    () => ({
      enabled: !!userId,
      ready: !!client && loadedFor === userId,
      invites: list,
      notices,
      ensureInvites,
      moveInvites,
      moveGuestToContact,
      dismissNotice,
    }),
    [userId, client, loadedFor, list, notices, ensureInvites, moveInvites, moveGuestToContact, dismissNotice],
  )
}

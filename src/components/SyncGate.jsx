import { useEffect, useMemo, useState } from 'react'
import App from '../App.jsx'
import LoginScreen from './LoginScreen.jsx'
import InitialSyncDialog from './InitialSyncDialog.jsx'
import { SYNC_ENABLED, getSupabase, hasStoredSession } from '../lib/sync/client'
import { SyncContext } from '../lib/sync/syncContext'
import { SyncEngine } from '../lib/sync/engine'
import { createRemote } from '../lib/sync/remote'
import { configureRemoteFiles } from '../lib/files/files'
import { promoteDeviceFiles } from '../lib/files/contactFiles'

// Sin credenciales de Supabase la app es exactamente la de siempre (solo este dispositivo).
export default function SyncGate() {
  if (!SYNC_ENABLED) return <App />
  return <SyncedApp />
}

function SyncedApp() {
  // undefined = aún no se sabe; null = sin sesión.
  const [session, setSession] = useState(undefined)
  const [client, setClient] = useState(null)

  useEffect(() => {
    let active = true
    let unsubscribe = () => {}
    getSupabase().then(async (supabase) => {
      if (!active) return
      setClient(supabase)
      const { data } = await supabase.auth.getSession()
      if (active) setSession(data.session || null)
      const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next || null))
      unsubscribe = () => listener.subscription.unsubscribe()
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const userId = session?.user?.id || null
  const email = session?.user?.email || ''

  // Un motor de sincronización por usuario con sesión.
  const engine = useMemo(() => {
    if (!client || !userId) return null
    return new SyncEngine({ remote: createRemote(client), userId, isOnline: () => navigator.onLine })
  }, [client, userId])

  useEffect(() => {
    if (!engine) return
    // Fotos y CV: se suben al bucket de Storage del usuario.
    configureRemoteFiles({ client, userId })
    engine
      .start()
      .then(() => promoteDeviceFiles())
      .catch(() => {})
    return () => {
      engine.stop()
      configureRemoteFiles(null)
    }
  }, [engine, client, userId])

  const sync = useMemo(
    () =>
      engine && {
        engine,
        email,
        signOut: async () => {
          const pending = engine.getSnapshot().pending
          const warning =
            pending > 0
              ? `Hay ${pending} cambio${pending === 1 ? '' : 's'} sin sincronizar. Se enviarán cuando vuelvas a iniciar sesión. ¿Cerrar sesión?`
              : '¿Cerrar sesión? Los datos seguirán guardados en este dispositivo.'
          if (!window.confirm(warning)) return
          engine.stop()
          await client.auth.signOut({ scope: 'local' })
        },
      },
    [engine, email, client],
  )

  // Mientras se comprueba la sesión guardada se abre ya la app con los datos locales.
  if (session === undefined) return hasStoredSession() ? <App /> : <div className="app-loading" />

  if (!session) {
    return (
      <LoginScreen
        onSignIn={async (userEmail, password) => {
          const { error } = await client.auth.signInWithPassword({ email: userEmail, password })
          if (error) throw error
        }}
      />
    )
  }

  if (!sync) return <App />

  return (
    <SyncContext.Provider value={sync}>
      <App />
      <InitialSyncDialog />
    </SyncContext.Provider>
  )
}

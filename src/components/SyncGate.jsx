import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import App from '../App.jsx'
import LoginScreen from './LoginScreen.jsx'
import InitialSyncDialog from './InitialSyncDialog.jsx'
import AccountStatusScreen from './AccountStatusScreen.jsx'
import MemberApp from './MemberApp.jsx'
import ViewAs from './viewAs/ViewAs.jsx'
import { SYNC_ENABLED, getSupabase, hasStoredSession } from '../lib/sync/client'
import { fetchOwnRole, readCachedRole, resolveRole, writeCachedRole } from '../lib/profiles'
import { SyncContext } from '../lib/sync/syncContext'
import { SyncEngine } from '../lib/sync/engine'
import { createRemote } from '../lib/sync/remote'
import { configureRemoteFiles } from '../lib/files/files'
import { promoteDeviceFiles } from '../lib/files/contactFiles'

// Portal del alumno: aparte (con su tipografía y estilos), solo se descarga si entra un alumno.
const StudentPortal = lazy(() => import('./StudentPortal.jsx'))

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

  // Papel de la cuenta (tabla profiles): solo la ceo entra en la app. { userId, status, role }.
  const [roleCheck, setRoleCheck] = useState(null)
  const [roleAttempt, setRoleAttempt] = useState(0)

  useEffect(() => {
    if (!client || !userId) return
    let active = true
    fetchOwnRole(client, userId).then((result) => {
      if (!active) return
      setRoleCheck({ userId, ...result })
      const known = resolveRole(result, null)
      if (known) writeCachedRole(userId, known)
    })
    return () => {
      active = false
    }
  }, [client, userId, roleAttempt])

  const result = roleCheck?.userId === userId ? roleCheck : undefined
  const role = userId ? resolveRole(result, readCachedRole(userId)) : null

  // Un motor de sincronización por usuario con sesión, solo para la ceo: las demás cuentas no
  // suben ni bajan los datos de este dispositivo.
  const engine = useMemo(() => {
    if (!client || !userId || role !== 'ceo') return null
    return new SyncEngine({ remote: createRemote(client), userId, isOnline: () => navigator.onLine })
  }, [client, userId, role])

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
        client,
        userId,
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
    [engine, email, client, userId],
  )

  // Mientras se comprueba la sesión guardada se abre ya la app con los datos locales (si la
  // cuenta de este dispositivo era la ceo).
  if (session === undefined) return hasStoredSession() && readCachedRole() === 'ceo' ? <App /> : <div className="app-loading" />

  if (!session) {
    return (
      <LoginScreen
        onSignIn={async (userEmail, password) => {
          const { error } = await client.auth.signInWithPassword({ email: userEmail, password })
          if (error) throw error
        }}
        onOAuth={async (provider) => {
          // Vuelve a esta misma app (Vercel o local); Supabase deja la sesión en la dirección y el
          // cliente la recoge al cargar (detectSessionInUrl).
          const { error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } })
          if (error) throw error
        }}
      />
    )
  }

  if (role !== 'ceo') {
    if (!role && result === undefined) return <div className="app-loading" />
    const signOutLocal = () => client.auth.signOut({ scope: 'local' })
    // Equipo: su menú según sus permisos (sin conexión, con lo último conocido no se sabe su
    // nombre ni su área: los pide al volver).
    if (role === 'equipo') {
      return <MemberApp client={client} email={email} name={result?.name || ''} area={result?.area || null} onSignOut={signOutLocal} />
    }
    if (role === 'alumno') {
      return (
        <Suspense fallback={<div className="app-loading" />}>
          <StudentPortal client={client} userId={userId} onSignOut={signOutLocal} />
        </Suspense>
      )
    }
    return (
      <AccountStatusScreen
        kind={role ? 'waiting' : 'error'}
        email={email}
        onRetry={() => setRoleAttempt((n) => n + 1)}
        onSignOut={signOutLocal}
      />
    )
  }

  if (!sync) return <App />

  return (
    <SyncContext.Provider value={sync}>
      {/* «Ver como» (temporal): la ceo ve la app como otro papel, en solo lectura. */}
      <ViewAs client={client}>
        <App />
        <InitialSyncDialog />
      </ViewAs>
    </SyncContext.Provider>
  )
}

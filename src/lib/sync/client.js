// Configuración de Supabase desde las variables de entorno de Vite (.env.local o Vercel).
// Sin ellas la app funciona como siempre: solo con los datos de este dispositivo.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const SYNC_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

// Clave de localStorage donde Supabase Auth recuerda la sesión.
export const AUTH_STORAGE_KEY = 'cesi_auth_v1'

let clientPromise = null

// El cliente se carga bajo demanda: si la sincronización no está configurada, ni se descarga.
export function getSupabase() {
  if (!SYNC_ENABLED) return null
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: AUTH_STORAGE_KEY },
      }),
    )
  }
  return clientPromise
}

// ¿Hay una sesión guardada en este dispositivo? (sin esperar a cargar el cliente)
export function hasStoredSession() {
  try {
    return !!localStorage.getItem(AUTH_STORAGE_KEY)
  } catch {
    return false
  }
}

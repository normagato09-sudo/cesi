// Llamada a una función de Supabase desde una página pública (/ficha, /confirmar), con la clave
// pública (anon), que no da acceso a ninguna tabla: solo a las funciones que lo permiten.
// Sin el cliente de Supabase, para que la página cargue lo mínimo.
//
// Si falla, lanza `makeError(code)`: 'unavailable' (sin configurar), 'network' (sin conexión),
// uno de `codes` si aparece en el mensaje de error de la función, o 'server'.
export async function callPublicRpc(name, args, { url, anonKey, fetchImpl = globalThis.fetch }, { codes, makeError }) {
  if (!url || !anonKey) throw makeError('unavailable')
  let res
  try {
    res = await fetchImpl(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    })
  } catch {
    throw makeError('network')
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const code = codes.find((c) => (body?.message || '').includes(c))
    throw makeError(code || 'server')
  }
  return body
}

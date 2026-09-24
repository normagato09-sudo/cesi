// Resolución de conflictos: gana el updated_at más reciente. Los borrados son filas con
// deleted_at, así que compiten igual que cualquier otro cambio.

export function toMs(stamp) {
  if (!stamp) return 0
  const ms = typeof stamp === 'number' ? stamp : Date.parse(stamp)
  return Number.isFinite(ms) ? ms : 0
}

/**
 * ¿Hay que aplicar en este dispositivo una fila que llega de la nube?
 * - pending: cambio local de ese documento que aún no se ha enviado (o null).
 * - known: lo último que este dispositivo sabe del documento { stamp } (o null).
 * - remote: fila de Supabase { updated_at }.
 */
export function shouldApplyRemote({ pending, known, remote }) {
  const remoteMs = toMs(remote.updated_at)
  // Un cambio local pendiente igual de reciente o más gana: se enviará y prevalecerá.
  if (pending && toMs(pending.updatedAt) >= remoteMs) return false
  // Ya tenemos esa versión o una más nueva (p. ej. el eco de nuestro propio envío).
  if (known && toMs(known.stamp) >= remoteMs) return false
  return true
}

// Fecha de un documento local para compararla con la nube al fusionar.
function localStamp(doc) {
  return toMs(doc?.updatedAt)
}

/**
 * Primer inicio de sesión con datos en los dos sitios: decide documento a documento qué versión
 * queda según la estrategia.
 * - 'cloud': se queda lo de la nube (lo local desaparece).
 * - 'device': se queda lo de este dispositivo (lo que solo está en la nube se borra).
 * - 'merge': unión por id; si un documento está en los dos, gana el más reciente.
 * localDocs: Map id → doc. remoteRows: filas de la tabla (incluidas las borradas).
 * Devuelve { local: Map id → doc que queda en el dispositivo, upload: [{ id, data, deleted, stamp }] }.
 */
export function planInitialSync(strategy, localDocs, remoteRows, now = Date.now()) {
  const remoteById = new Map(remoteRows.map((r) => [r.id, r]))
  const local = new Map()
  const upload = []
  const ids = new Set([...localDocs.keys(), ...remoteById.keys()])

  for (const id of ids) {
    const mine = localDocs.get(id)
    const row = remoteById.get(id)
    const cloudAlive = row && !row.deleted_at

    if (strategy === 'cloud') {
      if (cloudAlive) local.set(id, row.data)
      continue
    }

    if (strategy === 'device') {
      if (mine) {
        local.set(id, mine)
        upload.push({ id, data: mine, deleted: false, stamp: now })
      } else if (cloudAlive) {
        upload.push({ id, data: null, deleted: true, stamp: now })
      }
      continue
    }

    // merge
    if (mine && !row) {
      local.set(id, mine)
      upload.push({ id, data: mine, deleted: false, stamp: localStamp(mine) || now })
    } else if (!mine && row) {
      if (cloudAlive) local.set(id, row.data)
    } else if (localStamp(mine) > toMs(row.updated_at)) {
      local.set(id, mine)
      upload.push({ id, data: mine, deleted: false, stamp: localStamp(mine) })
    } else if (cloudAlive) {
      local.set(id, row.data)
    }
  }
  return { local, upload }
}

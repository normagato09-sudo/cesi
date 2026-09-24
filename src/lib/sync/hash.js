// JSON con las claves ordenadas: el mismo documento da el mismo texto aunque Postgres (jsonb)
// devuelva las claves en otro orden.
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`
}

// Huella corta de un documento (FNV-1a de 32 bits dos veces), para detectar cambios sin
// guardar una copia completa de cada documento.
export function docHash(doc) {
  const text = stableStringify(doc)
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = Math.imul(h2 ^ c, 0x811c9dc5)
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}${text.length.toString(36)}`
}

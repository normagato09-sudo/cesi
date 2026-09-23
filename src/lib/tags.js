// Etiquetas libres de las reuniones (p. ej. "entrevista", "proyecto X").

const MAX_TAG_LENGTH = 30

export function normalizeTag(text) {
  return (text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH)
}

// Clave para comparar sin distinguir mayúsculas ni acentos.
export function tagKey(tag) {
  return normalizeTag(tag)
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export function sameTag(a, b) {
  return tagKey(a) === tagKey(b)
}

export function addTag(tags, text) {
  const tag = normalizeTag(text)
  if (!tag || tags.some((t) => sameTag(t, tag))) return tags
  return [...tags, tag]
}

export function eventHasTag(event, tag) {
  return (event.tags || []).some((t) => sameTag(t, tag))
}

// Todas las etiquetas usadas, sin duplicados (se conserva la primera forma escrita), ordenadas.
export function allTags(events) {
  const byKey = new Map()
  for (const ev of events) {
    for (const t of ev.tags || []) {
      const key = tagKey(t)
      if (key && !byKey.has(key)) byKey.set(key, normalizeTag(t))
    }
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
}

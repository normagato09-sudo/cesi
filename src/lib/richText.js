// Texto con formato sencillo de la newsletter, en marcas (nunca HTML):
//   **negrita**   *cursiva*   [texto del enlace](https://…)
//   - punto de una lista          1. punto de una lista numerada
// Una línea en blanco separa párrafos. Se convierte en bloques que la pantalla pinta con elementos
// de React (el texto nunca se mete como HTML); los enlaces solo si son http o https.

const INLINE = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g

// ¿Enlace web? Devuelve la dirección normalizada o ''.
export function safeHref(url) {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''
  } catch {
    return ''
  }
}

// Una línea → [{ type: 'text'|'bold'|'italic'|'link', text, href? }].
export function parseInline(line) {
  const out = []
  let last = 0
  for (const m of line.matchAll(INLINE)) {
    if (m.index > last) out.push({ type: 'text', text: line.slice(last, m.index) })
    if (m[1] !== undefined) out.push({ type: 'bold', text: m[1] })
    else if (m[2] !== undefined) out.push({ type: 'italic', text: m[2] })
    else {
      const href = safeHref(m[4])
      out.push(href ? { type: 'link', text: m[3], href } : { type: 'text', text: m[0] })
    }
    last = m.index + m[0].length
  }
  if (last < line.length) out.push({ type: 'text', text: line.slice(last) })
  return out
}

const BULLET = /^\s*[-•]\s+(.*)$/
const NUMBER = /^\s*\d+[.)]\s+(.*)$/

// Texto → bloques: [{ type: 'p', lines: [inlines] } | { type: 'ul'|'ol', items: [inlines] }].
export function parseRichText(text) {
  const blocks = []
  let current = null
  const close = () => {
    if (current) blocks.push(current)
    current = null
  }
  for (const raw of String(text || '').replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      close()
      continue
    }
    const bullet = line.match(BULLET)
    const number = !bullet && line.match(NUMBER)
    const type = bullet ? 'ul' : number ? 'ol' : 'p'
    if (!current || current.type !== type) {
      close()
      current = type === 'p' ? { type, lines: [] } : { type, items: [] }
    }
    if (type === 'p') current.lines.push(parseInline(line.trim()))
    else current.items.push(parseInline((bullet || number)[1]))
  }
  close()
  return blocks
}

// El texto sin marcas, para el resumen de cada publicación.
export function plainText(text, max = 160) {
  const flat = String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(BULLET, '$1').replace(NUMBER, '$1'))
    .join(' ')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trim()}…`
}

/**
 * Botones de formato del editor: devuelven { value, start, end } (el texto nuevo y la selección).
 * wrap: rodea la selección (o un texto de ejemplo) con `before` y `after`.
 */
export function wrapSelection(value, start, end, before, after, sample) {
  const chosen = value.slice(start, end) || sample
  const next = value.slice(0, start) + before + chosen + after + value.slice(end)
  return { value: next, start: start + before.length, end: start + before.length + chosen.length }
}

// Convierte las líneas seleccionadas en una lista con puntos o numerada.
export function listLines(value, start, end, numbered) {
  const from = value.lastIndexOf('\n', start - 1) + 1
  const toBreak = value.indexOf('\n', end)
  const to = toBreak === -1 ? value.length : toBreak
  const lines = value.slice(from, to).split('\n')
  const done = lines.map((l, i) => {
    const text = l.replace(BULLET, '$1').replace(NUMBER, '$1')
    return numbered ? `${i + 1}. ${text}` : `- ${text}`
  })
  const block = done.join('\n')
  return { value: value.slice(0, from) + block + value.slice(to), start: from, end: from + block.length }
}

// Enlace: [texto](dirección), con la selección como texto.
export function linkSelection(value, start, end, url) {
  const href = safeHref(url)
  if (!href) return null
  const label = value.slice(start, end) || 'enlace'
  const insert = `[${label}](${href})`
  return { value: value.slice(0, start) + insert + value.slice(end), start, end: start + insert.length }
}

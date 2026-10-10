// Listas en las notas del acta. Las notas siguen siendo texto plano: una línea que empieza por
// "- " es una viñeta y una que empieza por "1. " es un punto numerado; cada nivel de sangría son
// INDENT espacios. Así las notas de siempre se ven igual y cualquier sitio que muestre el texto
// tal cual lo enseña bien.
//
// Las funciones de edición reciben el texto y la selección ({ text, start, end }) y devuelven el
// nuevo estado (texto y selección) o null si la tecla debe hacer lo de siempre.

export const INDENT = '  '
const MAX_LEVEL = 6
const LINE_RE = /^( *)(?:(-)|(\d{1,4})\.) (.*)$/

// { level, kind: 'bullet' | 'number', num, content, prefixLength } o null si no es de una lista.
export function parseLine(line) {
  const m = LINE_RE.exec(line)
  if (!m) return null
  const spaces = m[1].length
  return {
    level: Math.floor(spaces / INDENT.length),
    kind: m[2] ? 'bullet' : 'number',
    num: m[3] ? Number(m[3]) : null,
    content: m[4],
    prefixLength: line.length - m[4].length,
  }
}

function prefix(level, kind, num = 1) {
  return INDENT.repeat(level) + (kind === 'bullet' ? '- ' : `${num}. `)
}

// Línea en la que está la posición `pos`: { index, start, end, text }.
export function lineAt(text, pos) {
  const start = text.lastIndexOf('\n', pos - 1) + 1
  const nl = text.indexOf('\n', pos)
  const end = nl === -1 ? text.length : nl
  return { index: text.slice(0, start).split('\n').length - 1, start, end, text: text.slice(start, end) }
}

// Texto de la línea sin la viñeta o el número (lo que se convierte en decisión o tarea).
export function lineContent(line) {
  const parsed = parseLine(line)
  return (parsed ? parsed.content : line).trim()
}

// Cambia líneas enteras y mantiene la selección en el mismo sitio del texto.
// `edit(line, index)` devuelve la línea nueva.
function editLines(text, start, end, firstLine, lastLine, edit) {
  const lines = text.split('\n')
  let offset = 0
  let newStart = start
  let newEnd = end
  for (let i = 0; i < lines.length; i++) {
    const lineStart = offset
    offset += lines[i].length + 1
    if (i < firstLine || i > lastLine) continue
    const before = lines[i]
    const after = edit(before, i)
    if (after === before) continue
    lines[i] = after
    const delta = after.length - before.length
    // Si la selección está dentro del prefijo, se queda al principio del contenido.
    const shift = (pos) => (pos < lineStart ? pos : Math.max(lineStart, pos + delta))
    newStart = shift(newStart)
    newEnd = shift(newEnd)
    offset += delta
  }
  return { text: lines.join('\n'), start: newStart, end: newEnd }
}

/**
 * Recalcula los números de las listas numeradas. Cada lista empieza en el número que tenga su
 * primer punto; los subpuntos llevan su propia cuenta y una línea fuera de la lista (o vacía)
 * la corta. Devuelve { text, start, end } con la selección ajustada.
 */
export function renumber(text, start = 0, end = start) {
  const counters = []
  return editLines(text, start, end, 0, Infinity, (line) => {
    const parsed = parseLine(line)
    if (!parsed) {
      counters.length = 0
      return line
    }
    counters.length = Math.min(counters.length, parsed.level + 1)
    if (parsed.kind === 'bullet') {
      counters[parsed.level] = null
      return line
    }
    const prev = counters[parsed.level]
    const num = prev ? prev + 1 : parsed.num
    counters[parsed.level] = num
    return num === parsed.num ? line : prefix(parsed.level, 'number', num) + parsed.content
  })
}

/**
 * Enter: en un punto de una lista empieza el siguiente (mismo nivel y tipo); en un punto vacío
 * sale de la lista. Fuera de una lista, null (salto de línea normal).
 */
export function enter({ text, start, end }) {
  const line = lineAt(text, start)
  if (end > line.end) return null
  const parsed = parseLine(line.text)
  if (!parsed || start - line.start < parsed.prefixLength) return null
  if (!parsed.content.trim() && end === start) {
    const next = text.slice(0, line.start) + text.slice(line.end)
    return renumber(next, line.start)
  }
  const insert = '\n' + prefix(parsed.level, parsed.kind, (parsed.num || 0) + 1)
  const next = text.slice(0, start) + insert + text.slice(end)
  const caret = start + insert.length
  return renumber(next, caret)
}

function selectedLines(text, start, end) {
  const first = lineAt(text, start).index
  const last = lineAt(text, Math.max(start, end - (end > start && text[end - 1] === '\n' ? 1 : 0))).index
  return [first, last]
}

/**
 * Tab (+1) y Shift+Tab (-1): mete o saca un nivel los puntos de lista de la selección. Si en la
 * selección no hay ninguno, null (el tabulador sigue moviendo el foco).
 */
export function indent({ text, start, end }, delta) {
  const [first, last] = selectedLines(text, start, end)
  const lines = text.split('\n')
  if (!lines.slice(first, last + 1).some((l) => parseLine(l))) return null
  const result = editLines(text, start, end, first, last, (line) => {
    const parsed = parseLine(line)
    if (!parsed) return line
    const level = Math.max(0, Math.min(MAX_LEVEL, parsed.level + delta))
    // Un subpunto nuevo de una lista numerada empieza en 1 (lo ajusta renumber).
    const num = level > parsed.level ? 1 : parsed.num
    return prefix(level, parsed.kind, num) + parsed.content
  })
  return renumber(result.text, result.start, result.end)
}

/**
 * Botones de viñeta y número: convierte las líneas de la selección en puntos de ese tipo; si ya
 * lo eran todas, las deja como texto normal.
 */
export function toggleList({ text, start, end }, kind) {
  const [first, last] = selectedLines(text, start, end)
  const lines = text.split('\n').slice(first, last + 1)
  const allKind = lines.some((l) => parseLine(l)) && lines.every((l) => parseLine(l)?.kind === kind || !l.trim())
  const result = editLines(text, start, end, first, last, (line) => {
    const parsed = parseLine(line)
    if (allKind) return parsed ? INDENT.repeat(parsed.level) + parsed.content : line
    if (!line.trim() && lines.length > 1) return line
    return prefix(parsed?.level || 0, kind, 1) + (parsed ? parsed.content : line.trimStart())
  })
  return renumber(result.text, result.start, result.end)
}

/**
 * Bloques para mostrar unas notas ya escritas: { type: 'text', text } o
 * { type: 'list', kind, items: [{ text, num, children: [bloques] }] }.
 */
export function noteBlocks(text) {
  const root = []
  // Pila de listas abiertas: { level, list }.
  let stack = []
  for (const line of String(text || '').split('\n')) {
    const parsed = parseLine(line)
    if (!parsed) {
      stack = []
      const last = root[root.length - 1]
      if (last?.type === 'text') last.text += '\n' + line
      else root.push({ type: 'text', text: line })
      continue
    }
    while (stack.length && stack[stack.length - 1].level > parsed.level) stack.pop()
    let top = stack[stack.length - 1]
    if (top && top.level === parsed.level && top.list.kind !== parsed.kind) {
      stack.pop()
      top = stack[stack.length - 1]
    }
    if (!top || top.level < parsed.level) {
      const list = { type: 'list', kind: parsed.kind, start: parsed.num || 1, items: [] }
      const parentItem = top?.list.items[top.list.items.length - 1]
      if (parentItem) parentItem.children.push(list)
      else root.push(list)
      top = { level: parsed.level, list }
      stack.push(top)
    }
    top.list.items.push({ text: parsed.content, children: [] })
  }
  // Fuera las líneas vacías al principio y al final de los bloques de texto.
  return root
    .map((b) => (b.type === 'text' ? { ...b, text: b.text.replace(/^\n+|\n+$/g, '') } : b))
    .filter((b) => b.type !== 'text' || b.text.trim())
}

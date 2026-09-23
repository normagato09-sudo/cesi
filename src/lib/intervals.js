// Operaciones con listas de intervalos { start: Date, end: Date }.

export function mergeIntervals(intervals) {
  const sorted = [...intervals].filter((i) => i.end > i.start).sort((a, b) => a.start - b.start)
  const merged = []
  for (const interval of sorted) {
    const last = merged[merged.length - 1]
    if (last && interval.start <= last.end) {
      last.end = new Date(Math.max(last.end, interval.end))
    } else {
      merged.push({ start: interval.start, end: interval.end })
    }
  }
  return merged
}

// Partes comunes de dos listas de intervalos.
export function intersectIntervals(a, b) {
  const left = mergeIntervals(a)
  const right = mergeIntervals(b)
  const out = []
  let i = 0
  let j = 0
  while (i < left.length && j < right.length) {
    const start = new Date(Math.max(left[i].start, right[j].start))
    const end = new Date(Math.min(left[i].end, right[j].end))
    if (end > start) out.push({ start, end })
    if (left[i].end < right[j].end) i++
    else j++
  }
  return out
}

// Quita de `windows` todo lo que solape con `busy`.
export function subtractIntervals(windows, busy) {
  const blocks = mergeIntervals(busy)
  const out = []
  for (const w of mergeIntervals(windows)) {
    let cursor = w.start
    for (const b of blocks) {
      if (b.end <= cursor) continue
      if (b.start >= w.end) break
      if (b.start > cursor) out.push({ start: cursor, end: new Date(Math.min(b.start, w.end)) })
      cursor = new Date(Math.max(cursor, b.end))
      if (cursor >= w.end) break
    }
    if (cursor < w.end) out.push({ start: cursor, end: w.end })
  }
  return out
}

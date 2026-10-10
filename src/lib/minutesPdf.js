// PDF del acta (ver minutes.js) con jsPDF, que se carga solo al descargarlo. A4, Helvetica (lleva
// acentos, ñ, ¿ y «»), cabecera con CESI, secciones y pie con el número de página.

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 18
const CONTENT_W = PAGE_W - MARGIN * 2
const BOTTOM = PAGE_H - 20
const ACCENT = [37, 99, 235]
const TEXT = [31, 36, 48]
const MUTED = [107, 114, 128]
const LINE = [215, 218, 224]
const LH = 5.2 // alto de línea del texto normal (mm)

export async function buildMinutesPdf(data) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = MARGIN

  const color = (rgb) => doc.setTextColor(...rgb)
  const font = (style, size) => {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
  }
  const ensure = (height) => {
    if (y + height <= BOTTOM) return
    doc.addPage()
    y = MARGIN
  }
  // Párrafo partido en líneas desde `x` con ancho `width`; devuelve las líneas escritas.
  const paragraph = (text, x, width, { style = 'normal', size = 10.5, rgb = TEXT, lh = LH } = {}) => {
    font(style, size)
    color(rgb)
    const lines = doc.splitTextToSize(String(text), width)
    for (const line of lines) {
      ensure(lh)
      doc.text(line, x, y + lh * 0.75)
      y += lh
    }
    return lines.length
  }
  const section = (title) => {
    ensure(16)
    y += 5
    font('bold', 10)
    color(ACCENT)
    doc.text(title.toUpperCase(), MARGIN, y + 4)
    y += 6
    doc.setDrawColor(...LINE)
    doc.setLineWidth(0.2)
    doc.line(MARGIN, y, PAGE_W - MARGIN, y)
    y += 3
  }
  const empty = (text) => paragraph(text, MARGIN, CONTENT_W, { style: 'italic', rgb: MUTED })

  // Cabecera
  font('bold', 20)
  color(ACCENT)
  doc.text('CESI', MARGIN, y + 7)
  font('normal', 10)
  color(MUTED)
  doc.text('Acta de reunión', PAGE_W - MARGIN, y + 7, { align: 'right' })
  y += 11
  doc.setDrawColor(...ACCENT)
  doc.setLineWidth(0.8)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
  y += 8

  paragraph(data.title, MARGIN, CONTENT_W, { style: 'bold', size: 17, lh: 7.5 })
  y += 1
  paragraph(data.when, MARGIN, CONTENT_W, { size: 10.5, rgb: MUTED })

  section('Asistentes')
  if (data.attendees.length === 0) empty('Sin asistentes apuntados.')
  else paragraph(data.attendees.join(' · '), MARGIN, CONTENT_W)

  section('Agenda')
  if (data.agenda.length === 0) empty('Sin puntos de agenda.')
  for (const item of data.agenda) {
    font('normal', 10.5)
    const lines = doc.splitTextToSize(item.text, CONTENT_W - 8)
    ensure(LH * lines.length + 1)
    // Casilla, marcada si el punto se trató.
    doc.setDrawColor(...(item.done ? ACCENT : MUTED))
    doc.setLineWidth(0.35)
    doc.rect(MARGIN + 0.5, y + 1, 3.4, 3.4)
    if (item.done) {
      doc.setDrawColor(...ACCENT)
      doc.setLineWidth(0.6)
      doc.line(MARGIN + 1.1, y + 2.8, MARGIN + 2, y + 3.8)
      doc.line(MARGIN + 2, y + 3.8, MARGIN + 3.5, y + 1.6)
    }
    paragraph(item.text, MARGIN + 7, CONTENT_W - 7)
    y += 0.8
  }
  if (data.agenda.length > 0) {
    const done = data.agenda.filter((it) => it.done).length
    y += 1
    paragraph(`${done} de ${data.agenda.length} puntos tratados.`, MARGIN, CONTENT_W, { size: 9, rgb: MUTED })
  }

  section('Notas')
  if (data.notes.length === 0) empty('Sin notas.')
  const drawList = (list, level) => {
    list.items.forEach((item, i) => {
      const indent = MARGIN + level * 6
      const marker = list.kind === 'number' ? `${list.start + i}.` : '•'
      font('normal', 10.5)
      ensure(LH)
      color(TEXT)
      doc.text(marker, indent + (list.kind === 'number' ? 4.5 : 1.5), y + LH * 0.75, { align: list.kind === 'number' ? 'right' : 'left' })
      paragraph(item.text, indent + 6, CONTENT_W - (indent - MARGIN) - 6)
      for (const child of item.children) drawList(child, level + 1)
    })
  }
  for (const block of data.notes) {
    if (block.type === 'list') drawList(block, 0)
    else {
      for (const line of block.text.split('\n')) {
        if (line.trim()) paragraph(line, MARGIN, CONTENT_W)
        else y += LH * 0.6
      }
    }
    y += 1.5
  }

  section('Decisiones')
  if (data.decisions.length === 0) empty('Sin decisiones.')
  data.decisions.forEach((text, i) => {
    font('bold', 10.5)
    ensure(LH)
    color(ACCENT)
    doc.text(`${i + 1}.`, MARGIN + 4.5, y + LH * 0.75, { align: 'right' })
    paragraph(text, MARGIN + 7, CONTENT_W - 7)
    y += 0.8
  })

  section('Tareas')
  if (data.tasks.length === 0) empty('Sin tareas.')
  if (data.tasks.length > 0) {
    const colWho = 48
    const colDue = 26
    const colWhat = CONTENT_W - colWho - colDue
    font('bold', 9)
    color(MUTED)
    ensure(6)
    doc.text('TAREA', MARGIN, y + 4)
    doc.text('RESPONSABLE', MARGIN + colWhat, y + 4)
    doc.text('FECHA LÍMITE', PAGE_W - MARGIN, y + 4, { align: 'right' })
    y += 6
    for (const task of data.tasks) {
      font('normal', 10.5)
      const what = doc.splitTextToSize(task.done ? `${task.title} (hecha)` : task.title, colWhat - 4)
      const who = doc.splitTextToSize(task.assignee, colWho - 4)
      const rows = Math.max(what.length, who.length)
      ensure(rows * LH + 3)
      doc.setDrawColor(...LINE)
      doc.setLineWidth(0.2)
      doc.line(MARGIN, y, PAGE_W - MARGIN, y)
      y += 1.2
      color(TEXT)
      what.forEach((line, i) => doc.text(line, MARGIN, y + LH * (i + 0.75)))
      who.forEach((line, i) => doc.text(line, MARGIN + colWhat, y + LH * (i + 0.75)))
      color(task.due === 'Sin fecha' ? MUTED : TEXT)
      doc.text(task.due, PAGE_W - MARGIN, y + LH * 0.75, { align: 'right' })
      y += rows * LH + 1
    }
  }

  // Pie en todas las páginas.
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    font('normal', 8.5)
    color(MUTED)
    doc.setDrawColor(...LINE)
    doc.setLineWidth(0.2)
    doc.line(MARGIN, PAGE_H - 14, PAGE_W - MARGIN, PAGE_H - 14)
    const footer = doc.splitTextToSize(`CESI · Acta de «${data.title}»`, CONTENT_W - 30)[0]
    doc.text(footer, MARGIN, PAGE_H - 9)
    doc.text(`Página ${p} de ${pages}`, PAGE_W - MARGIN, PAGE_H - 9, { align: 'right' })
  }

  return doc.output('blob')
}

// Descarga el PDF con ese nombre.
export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

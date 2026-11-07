// PDF del certificado (parte 44), con el diseño del lienzo (artboard 18): A4 horizontal, todo
// centrado, borde doble, cabecera CIFA (y logo de empresa), nombre y curso en Cormorant Garamond,
// media y asistencia opcionales, dos firmas con el sello en medio y el pie con el código.
// Las medidas del diseño están en px (A4 a 96 ppp: 1123 × 794) y se pasan a pt (× 0,75).
// Fuentes incrustadas: Plus Jakarta Sans y Cormorant Garamond (licencia OFL), cargadas solo al
// generar (loadCertificateFonts). Sin fuentes (tests), usa Helvetica y Times.

export const DESIGN = { width: 1123, height: 794 }
export const SITE = 'cifa-academy.com'
const S = 0.75
const p = (px) => px * S

const BLUE = '#1F5FD6'
const SOFT = '#C9D6EE'
const INK = '#0F1B33'
const GRAY = '#4B5563'
const CHIP = '#EEF3FC'

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// «3 de noviembre de 2026» de 'AAAA-MM-DD' ('' si no vale).
export function longDate(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '')
  if (!m) return ''
  return `${Number(m[3])} de ${MONTHS[Number(m[2]) - 1]} de ${m[1]}`
}

// «Del 3 de noviembre de 2026 al 15 de diciembre de 2026 · 24 horas».
export function periodText(startDate, endDate, hours) {
  const from = longDate(startDate)
  const to = longDate(endDate)
  const dates = from && to ? `Del ${from} al ${to}` : from ? `Desde el ${from}` : to ? `Hasta el ${to}` : ''
  const h = hours > 0 ? `${String(Math.round(hours * 10) / 10).replace('.', ',')} ${hours === 1 ? 'hora' : 'horas'}` : ''
  return [dates, h].filter(Boolean).join(' · ')
}

// Siguiente código del año: CIFA-2026-0001, CIFA-2026-0002…
export function nextCertificateCode(codes, year) {
  const prefix = `CIFA-${year}-`
  let max = 0
  for (const c of codes || []) {
    if (typeof c === 'string' && c.startsWith(prefix)) max = Math.max(max, Number(c.slice(prefix.length)) || 0)
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

export const statText = {
  average: (n) => `Nota media: ${String(Math.round(n * 100) / 100).replace('.', ',')} / 10`,
  attendance: (n) => `Asistencia: ${Math.round(n)} %`,
}

// ---------------------------------------------------------------------------
// Fuentes
// ---------------------------------------------------------------------------
let fontsPromise = null

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

// { jakarta400, jakarta700, jakarta800, cormorant700 } en base64 (una sola vez por sesión).
export function loadCertificateFonts() {
  if (!fontsPromise) {
    fontsPromise = (async () => {
      const [{ default: j400 }, { default: j700 }, { default: j800 }, { default: c700 }] = await Promise.all([
        import('@expo-google-fonts/plus-jakarta-sans/400Regular/PlusJakartaSans_400Regular.ttf?url'),
        import('@expo-google-fonts/plus-jakarta-sans/700Bold/PlusJakartaSans_700Bold.ttf?url'),
        import('@expo-google-fonts/plus-jakarta-sans/800ExtraBold/PlusJakartaSans_800ExtraBold.ttf?url'),
        import('@expo-google-fonts/cormorant-garamond/700Bold/CormorantGaramond_700Bold.ttf?url'),
      ])
      const load = async (url) => toBase64(await (await fetch(url)).arrayBuffer())
      const [jakarta400, jakarta700, jakarta800, cormorant700] = await Promise.all([load(j400), load(j700), load(j800), load(c700)])
      return { jakarta400, jakarta700, jakarta800, cormorant700 }
    })().catch((err) => {
      fontsPromise = null
      throw err
    })
  }
  return fontsPromise
}

function registerFonts(doc, fonts) {
  if (!fonts) return { sans: 'helvetica', serif: 'times', regular: 'normal', bold: 'bold', black: 'bold' }
  const add = (file, data, family, style) => {
    doc.addFileToVFS(file, data)
    doc.addFont(file, family, style)
  }
  add('PlusJakartaSans-Regular.ttf', fonts.jakarta400, 'PlusJakartaSans', 'normal')
  add('PlusJakartaSans-Bold.ttf', fonts.jakarta700, 'PlusJakartaSans', 'bold')
  add('PlusJakartaSans-ExtraBold.ttf', fonts.jakarta800, 'PlusJakartaSansExtra', 'bold')
  add('CormorantGaramond-Bold.ttf', fonts.cormorant700, 'CormorantGaramond', 'bold')
  return { sans: 'PlusJakartaSans', sansBlack: 'PlusJakartaSansExtra', serif: 'CormorantGaramond', regular: 'normal', bold: 'bold', black: 'bold' }
}

// ---------------------------------------------------------------------------
// Dibujo
// ---------------------------------------------------------------------------
function textWidth(doc, text, charSpacePx = 0) {
  return doc.getTextWidth(text) + p(charSpacePx) * Math.max(0, text.length - 1)
}

// Texto centrado en cx (px), con espaciado entre letras (px).
function centered(doc, text, cx, baseline, charSpacePx = 0) {
  doc.setCharSpace(p(charSpacePx))
  doc.text(text, p(cx) - textWidth(doc, text, charSpacePx) / 2, p(baseline))
  doc.setCharSpace(0)
}

// Tamaño (px) para que el texto quepa en maxWidth (px), entre max y min.
function fitSize(doc, text, maxPx, minPx, maxWidthPx) {
  let size = maxPx
  while (size > minPx) {
    doc.setFontSize(p(size))
    if (doc.getTextWidth(text) <= p(maxWidthPx)) break
    size -= 2
  }
  doc.setFontSize(p(size))
  return size
}

// Imagen dentro de una caja (px), sin deformar. img: { dataUrl, format, width, height }.
function imageBox(img, maxW, maxH) {
  const ratio = Math.min(maxW / img.width, maxH / img.height, 1.5)
  return { w: img.width * ratio, h: img.height * ratio }
}

function signature(doc, f, sig, cx) {
  const lineY = 612
  if (sig?.image) {
    const { w, h } = imageBox(sig.image, 210, 64)
    doc.addImage(sig.image.dataUrl, sig.image.format, p(cx - w / 2), p(lineY - 6 - h), p(w), p(h))
  }
  doc.setDrawColor('#9CA3AF')
  doc.setLineWidth(p(1))
  doc.line(p(cx - 120), p(lineY), p(cx + 120), p(lineY))
  if (sig?.name) {
    doc.setFont(f.sans, f.bold)
    doc.setFontSize(p(14))
    doc.setTextColor(INK)
    centered(doc, sig.name, cx, lineY + 22)
  }
  if (sig?.title) {
    doc.setFont(f.sans, f.regular)
    doc.setFontSize(p(12))
    doc.setTextColor(GRAY)
    centered(doc, sig.title, cx, lineY + 40)
  }
}

function seal(doc, f, cx, cy) {
  doc.setDrawColor(BLUE)
  doc.setLineWidth(p(2))
  doc.circle(p(cx), p(cy), p(70), 'S')
  doc.setLineWidth(p(1))
  doc.setLineDashPattern([p(3), p(3)], 0)
  doc.circle(p(cx), p(cy), p(60), 'S')
  doc.setLineDashPattern([], 0)
  doc.setTextColor(BLUE)
  doc.setFont(f.sansBlack || f.sans, f.black)
  doc.setFontSize(p(22))
  centered(doc, 'CIFA', cx, cy + 2, 2)
  doc.setFont(f.sans, f.bold)
  doc.setFontSize(p(9))
  centered(doc, 'CERTIFICADO', cx, cy + 20, 2)
}

/**
 * Crea el PDF (jsPDF). data:
 *   personName, courseName, startDate, endDate ('AAAA-MM-DD'), hours, issuedOn ('AAAA-MM-DD'), code,
 *   showStats, average (o null), attendance (o null),
 *   left / right: { name, title, image? } (o null), logo: { name, image } (o null).
 * fonts: lo de loadCertificateFonts() (null: fuentes estándar).
 */
export async function buildCertificatePdf(data, fonts = null) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4', compress: true })
  const f = registerFonts(doc, fonts)
  const W = DESIGN.width
  const H = DESIGN.height
  const cx = W / 2
  doc.setProperties({ title: `Certificado · ${data.personName} · ${data.courseName}`, subject: data.code || '', creator: 'CIFA' })

  // Fondo blanco y borde doble: 2 px azul a 28 px del borde, 6 px de separación y 1 px suave.
  doc.setFillColor('#FFFFFF')
  doc.rect(0, 0, p(W), p(H), 'F')
  doc.setDrawColor(BLUE)
  doc.setLineWidth(p(2))
  doc.rect(p(29), p(29), p(W - 58), p(H - 58), 'S')
  doc.setDrawColor(SOFT)
  doc.setLineWidth(p(1))
  doc.rect(p(36.5), p(36.5), p(W - 73), p(H - 73), 'S')

  // Cabecera: cuadrado azul con la «C», «CIFA» y, si hay, el logo de la empresa.
  doc.setFont(f.sansBlack || f.sans, f.black)
  doc.setFontSize(p(22))
  const brandW = textWidth(doc, 'CIFA', 3)
  const logo = data.logo?.image ? imageBox(data.logo.image, 170, 44) : null
  const groupW = 44 + 14 + brandW + (logo ? 22 + 1 + 22 + logo.w : 0)
  let x = cx - groupW / 2
  const top = 76
  doc.setFillColor(BLUE)
  doc.roundedRect(p(x), p(top), p(44), p(44), p(12), p(12), 'F')
  doc.setTextColor('#FFFFFF')
  doc.setFontSize(p(26))
  centered(doc, 'C', x + 22, top + 31)
  x += 44 + 14
  doc.setTextColor(INK)
  doc.setFontSize(p(22))
  doc.setCharSpace(p(3))
  doc.text('CIFA', p(x), p(top + 30))
  doc.setCharSpace(0)
  x += brandW
  if (logo) {
    x += 22
    doc.setDrawColor('#D1D5DB')
    doc.setLineWidth(p(1))
    doc.line(p(x), p(top + 4), p(x), p(top + 40))
    x += 23
    doc.addImage(data.logo.image.dataUrl, data.logo.image.format, p(x), p(top + 22 - logo.h / 2), p(logo.w), p(logo.h))
  }

  // Título y textos.
  doc.setFont(f.sans, f.bold)
  doc.setFontSize(p(13))
  doc.setTextColor(BLUE)
  centered(doc, 'CERTIFICADO DE FINALIZACIÓN', cx, 172, 4.5)

  doc.setFont(f.sans, f.regular)
  doc.setFontSize(p(16))
  doc.setTextColor(GRAY)
  centered(doc, 'Se certifica que', cx, 214)

  doc.setFont(f.serif, f.bold)
  doc.setTextColor(INK)
  fitSize(doc, data.personName || '', 60, 32, 900)
  centered(doc, data.personName || '', cx, 290)
  doc.setDrawColor(SOFT)
  doc.setLineWidth(p(1))
  doc.line(p(cx - 210), p(312), p(cx + 210), p(312))

  doc.setFont(f.sans, f.regular)
  doc.setFontSize(p(16))
  doc.setTextColor(GRAY)
  centered(doc, 'ha completado con éxito el curso', cx, 350)

  doc.setFont(f.serif, f.bold)
  doc.setTextColor(BLUE)
  fitSize(doc, data.courseName || '', 36, 22, 880)
  centered(doc, data.courseName || '', cx, 396)

  const period = periodText(data.startDate, data.endDate, data.hours)
  if (period) {
    doc.setFont(f.sans, f.regular)
    doc.setFontSize(p(14))
    doc.setTextColor(GRAY)
    centered(doc, period, cx, 428)
  }

  // Media y asistencia (si se eligen): etiquetas redondeadas.
  const chips = data.showStats
    ? [data.average !== null && data.average !== undefined ? statText.average(data.average) : null, data.attendance !== null && data.attendance !== undefined ? statText.attendance(data.attendance) : null].filter(Boolean)
    : []
  if (chips.length) {
    doc.setFont(f.sans, f.bold)
    doc.setFontSize(p(13))
    const widths = chips.map((c) => doc.getTextWidth(c) / S + 28)
    const total = widths.reduce((a, b) => a + b, 0) + 12 * (chips.length - 1)
    let cxx = cx - total / 2
    chips.forEach((c, i) => {
      doc.setFillColor(CHIP)
      doc.roundedRect(p(cxx), p(450), p(widths[i]), p(30), p(15), p(15), 'F')
      doc.setTextColor(INK)
      centered(doc, c, cxx + widths[i] / 2, 470)
      cxx += widths[i] + 12
    })
  }

  // Firmas y sello.
  signature(doc, f, data.left, cx - 330)
  seal(doc, f, cx, 590)
  signature(doc, f, data.right, cx + 330)

  // Pie.
  doc.setFont(f.sans, f.regular)
  doc.setFontSize(p(11))
  doc.setTextColor(GRAY)
  doc.text(`Emitido el ${longDate(data.issuedOn)}`, p(72), p(H - 62))
  const right = `Código de verificación: ${data.code || '—'} · ${SITE}`
  doc.text(right, p(W - 72) - doc.getTextWidth(right), p(H - 62))
  return doc
}

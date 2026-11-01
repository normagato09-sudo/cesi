// Finanzas (ver supabase/parte19_finanzas.sql): ingresos y gastos del equipo, presupuesto por área
// e historial de cambios. Son datos del equipo en Supabase (no de mi sincronización). Las
// cantidades van en céntimos (enteros) para no tener errores de redondeo.
//
// Movimiento (cesi_finance_movements): { id, kind: 'ingreso' | 'gasto', day: 'AAAA-MM-DD', concept,
//   amount_cents, category, area, area_name, method, receipt_url, notes, contact_id, contact_name,
//   created_by_name, updated_by_name, created_at, updated_at, can_edit }

export const KINDS = [
  { id: 'ingreso', label: 'Ingreso' },
  { id: 'gasto', label: 'Gasto' },
]
export const CATEGORIES = {
  ingreso: [
    { id: 'patrocinio', label: 'Patrocinio' },
    { id: 'donacion', label: 'Donación' },
    { id: 'colaboracion', label: 'Colaboración' },
    { id: 'otro', label: 'Otro' },
  ],
  gasto: [
    { id: 'dominio_web', label: 'Dominio y web' },
    { id: 'herramientas', label: 'Herramientas y suscripciones' },
    { id: 'premios', label: 'Premios y concursos' },
    { id: 'publicidad', label: 'Publicidad' },
    { id: 'material', label: 'Material' },
    { id: 'otro', label: 'Otro' },
  ],
}
export const METHODS = [
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'paypal', label: 'PayPal' },
  { id: 'tarjeta', label: 'Tarjeta' },
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'otro', label: 'Otro' },
]
export const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.id, k.label]))
export const METHOD_LABEL = Object.fromEntries(METHODS.map((m) => [m.id, m.label]))

export function categoryLabel(kind, id) {
  return CATEGORIES[kind]?.find((c) => c.id === id)?.label || id || ''
}

// Presupuesto: naranja desde el 80 %, rojo si se pasa.
export const BUDGET_WARN = 0.8

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']

// 'AAAA-MM-DD' → «noviembre de 2030» / «nov».
export function monthLabel(key) {
  return `${MONTHS[Number(key.slice(5, 7)) - 1]} de ${key.slice(0, 4)}`
}
export function monthShort(key) {
  return MONTHS_SHORT[Number(key.slice(5, 7)) - 1]
}

export function dayLabel(key) {
  const [y, m, d] = key.split('-')
  return `${Number(d)}/${Number(m)}/${y}`
}

// ---------------------------------------------------------------------------
// Cantidades
// ---------------------------------------------------------------------------

// «1.234,50 €» (con signo menos si es negativo).
export function euros(cents) {
  const n = Number(cents || 0) / 100
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

// «1234,5», «1.234,50» o «1234.5» → céntimos (null si no es una cantidad válida, > 0).
export function parseEuros(text) {
  let t = String(text || '').trim().replace(/\s|€/g, '')
  if (!t) return null
  // Con coma decimal, los puntos son de miles; si solo hay puntos, el último puede ser el decimal.
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if ((t.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(t)) t = t.replace(/\./g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  const cents = Math.round(Number(t) * 100)
  return cents > 0 ? cents : null
}

// Céntimos → texto del campo («1234,50»).
export function centsToInput(cents) {
  if (cents === null || cents === undefined) return ''
  return (Number(cents) / 100).toFixed(2).replace('.', ',')
}

// Con signo: + en ingresos y − en gastos.
export function signedCents(m) {
  return m.kind === 'ingreso' ? m.amount_cents : -m.amount_cents
}

// ---------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------

function normalize(text) {
  return (text || '')
    .toString()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/**
 * Filtros: { month ('AAAA-MM' o ''), kind, category, area ('none': sin área), query }. El buscador
 * mira el concepto, las notas y el contacto.
 */
export function filterMovements(list, { month = '', kind = '', category = '', area = '', query = '' } = {}) {
  const q = normalize(query)
  return list.filter((m) => {
    if (month && m.day.slice(0, 7) !== month) return false
    if (kind && m.kind !== kind) return false
    if (category && m.category !== category) return false
    if (area === 'none' && m.area) return false
    if (area && area !== 'none' && m.area !== area) return false
    if (q && ![m.concept, m.notes, m.contact_name].some((t) => normalize(t).includes(q))) return false
    return true
  })
}

// { income, expense, balance } de una lista (en céntimos).
export function totals(list) {
  let income = 0
  let expense = 0
  for (const m of list) {
    if (m.kind === 'ingreso') income += Number(m.amount_cents)
    else expense += Number(m.amount_cents)
  }
  return { income, expense, balance: income - expense }
}

// Estado del presupuesto de un área: { ratio, level: 'ok' | 'warn' | 'over' } (null sin presupuesto).
export function budgetState({ monthly, spent }) {
  if (monthly === null || monthly === undefined) return null
  if (!monthly) return { ratio: spent > 0 ? 1 : 0, level: spent > 0 ? 'over' : 'ok' }
  const ratio = spent / monthly
  return { ratio, level: ratio > 1 ? 'over' : ratio >= BUDGET_WARN ? 'warn' : 'ok' }
}

// ---------------------------------------------------------------------------
// CSV (para Excel en español: separador «;», coma decimal y BOM para los acentos)
// ---------------------------------------------------------------------------

const BOM = String.fromCharCode(0xfeff)

function csvCell(value) {
  const text = String(value ?? '')
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function csvAmount(cents) {
  return (Number(cents) / 100).toFixed(2).replace('.', ',')
}

export function movementsCsv(list) {
  const header = ['Fecha', 'Tipo', 'Concepto', 'Cantidad (€)', 'Categoría', 'Área', 'Método', 'Contacto', 'Justificante', 'Notas']
  const rows = list.map((m) => [
    m.day,
    KIND_LABEL[m.kind] || m.kind,
    m.concept,
    csvAmount(signedCents(m)),
    categoryLabel(m.kind, m.category),
    m.area_name || '',
    METHOD_LABEL[m.method] || m.method,
    m.contact_name || '',
    m.receipt_url || '',
    m.notes || '',
  ])
  return `${BOM}${[header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n')}\r\n`
}

// Descarga el CSV en el navegador.
export function downloadCsv(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ---------------------------------------------------------------------------
// Formulario
// ---------------------------------------------------------------------------

export function emptyMovementForm(todayKey, kind = 'gasto') {
  return { kind, day: todayKey, concept: '', amount: '', category: CATEGORIES[kind][0].id, area: '', method: 'transferencia', receiptUrl: '', notes: '', contact: '' }
}

export function formFromMovement(m) {
  return {
    kind: m.kind,
    day: m.day,
    concept: m.concept,
    amount: centsToInput(m.amount_cents),
    category: m.category,
    area: m.area || '',
    method: m.method,
    receiptUrl: m.receipt_url || '',
    notes: m.notes || '',
    contact: m.contact_id || '',
  }
}

export function validateMovementForm(form) {
  const errors = {}
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.day || '')) errors.day = 'Pon la fecha.'
  if (!form.concept.trim()) errors.concept = 'Escribe el concepto.'
  else if (form.concept.trim().length > 200) errors.concept = 'Como mucho 200 caracteres.'
  if (parseEuros(form.amount) === null) errors.amount = 'Pon una cantidad mayor que 0 (p. ej. 25,50).'
  if (!CATEGORIES[form.kind]?.some((c) => c.id === form.category)) errors.category = 'Elige la categoría.'
  if (form.receiptUrl && !/^https?:\/\/\S+$/i.test(form.receiptUrl.trim())) errors.receiptUrl = 'Pon un enlace que empiece por https://'
  if (form.notes.length > 2000) errors.notes = 'Como mucho 2000 caracteres.'
  return errors
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

async function rpc(client, fn, args) {
  const { data, error } = await client.rpc(fn, args)
  if (error) throw new Error(financeErrorText(error))
  return data
}

export function listMovements(client, asId = null) {
  return rpc(client, 'cesi_finance_movements', { p_as: asId })
}

export function financeSummary(client, month = null, asId = null) {
  return rpc(client, 'cesi_finance_summary', { p_month: month, p_as: asId })
}

export async function monthBalance(client, asId = null) {
  const rows = await rpc(client, 'cesi_finance_month_balance', { p_as: asId })
  return rows?.[0] || { income: 0, expense: 0, balance: 0 }
}

export function financeLog(client, asId = null) {
  return rpc(client, 'cesi_finance_log', { p_as: asId })
}

export function financeContacts(client) {
  return rpc(client, 'cesi_finance_contacts', {})
}

export function saveMovement(client, id, form) {
  return rpc(client, 'cesi_finance_save', {
    p_id: id,
    p_kind: form.kind,
    p_day: form.day,
    p_concept: form.concept.trim(),
    p_amount_cents: parseEuros(form.amount),
    p_category: form.category,
    p_area: form.area || null,
    p_method: form.method,
    p_receipt_url: form.receiptUrl.trim(),
    p_notes: form.notes.trim(),
    p_contact: form.kind === 'ingreso' && form.contact ? form.contact : null,
  })
}

export function deleteMovement(client, id) {
  return rpc(client, 'cesi_finance_delete', { p_id: id })
}

export function setBudget(client, area, cents) {
  return rpc(client, 'cesi_finance_budget_set', { p_area: area, p_monthly_cents: cents })
}

export function financeErrorText(err) {
  if (err?.code === 'PGRST202' || err?.code === '42883') return 'Falta ejecutar en Supabase el SQL de la parte 19 (finanzas).'
  return err?.message || 'No se pudo completar. Comprueba la conexión.'
}

import { describe, expect, it } from 'vitest'
import {
  budgetState,
  centsToInput,
  emptyMovementForm,
  euros,
  filterMovements,
  formFromMovement,
  movementsCsv,
  parseEuros,
  totals,
  validateMovementForm,
} from './finance'

const mov = (id, extra = {}) => ({ id, kind: 'gasto', day: '2030-11-04', concept: id, amount_cents: 1000, category: 'material', area: null, area_name: '', method: 'tarjeta', receipt_url: '', notes: '', contact_name: '', ...extra })

describe('cantidades', () => {
  it('lee euros con coma o punto y sin errores de redondeo', () => {
    expect(parseEuros('25,50')).toBe(2550)
    expect(parseEuros('1.234,56')).toBe(123456)
    expect(parseEuros('1234.5')).toBe(123450)
    expect(parseEuros('1.234')).toBe(123400)
    expect(parseEuros('0,1')).toBe(10)
    expect(parseEuros('19,99 €')).toBe(1999)
    expect(parseEuros('0')).toBe(null)
    expect(parseEuros('-5')).toBe(null)
    expect(parseEuros('abc')).toBe(null)
    expect(parseEuros('1,234')).toBe(null)
  })

  it('las muestra en español', () => {
    expect(euros(123456)).toMatch(/1\.?234,56 €/)
    expect(euros(-500)).toMatch(/-5,00 €/)
    expect(centsToInput(2550)).toBe('25,50')
  })
})

describe('lista', () => {
  const list = [
    mov('luz', { kind: 'gasto', area: 'media', day: '2030-11-02', amount_cents: 3000 }),
    mov('patro', { kind: 'ingreso', category: 'patrocinio', day: '2030-11-10', amount_cents: 50000, contact_name: 'Empresa Sol' }),
    mov('octubre', { day: '2030-10-30', amount_cents: 999 }),
  ]

  it('filtros por mes, tipo, categoría, área y buscador', () => {
    expect(filterMovements(list, { month: '2030-11' }).map((m) => m.id)).toEqual(['luz', 'patro'])
    expect(filterMovements(list, { kind: 'ingreso' }).map((m) => m.id)).toEqual(['patro'])
    expect(filterMovements(list, { area: 'media' }).map((m) => m.id)).toEqual(['luz'])
    expect(filterMovements(list, { area: 'none' }).map((m) => m.id)).toEqual(['patro', 'octubre'])
    expect(filterMovements(list, { query: 'sol' }).map((m) => m.id)).toEqual(['patro'])
    expect(filterMovements(list, { category: 'patrocinio' }).map((m) => m.id)).toEqual(['patro'])
  })

  it('totales en céntimos', () => {
    expect(totals(filterMovements(list, { month: '2030-11' }))).toEqual({ income: 50000, expense: 3000, balance: 47000 })
  })

  it('CSV para Excel en español (separador «;» y coma decimal, gastos en negativo)', () => {
    const csv = movementsCsv([mov('Tinta; papel', { notes: 'Dijo "urgente"' }), mov('Patrocinio', { kind: 'ingreso', category: 'patrocinio', amount_cents: 150050 })])
    const bom = String.fromCharCode(0xfeff)
    const lines = csv.replace(bom, '').trim().split('\r\n')
    expect(lines[0]).toBe('Fecha;Tipo;Concepto;Cantidad (€);Categoría;Área;Método;Contacto;Justificante;Notas')
    expect(lines[1]).toBe('2030-11-04;Gasto;"Tinta; papel";-10,00;Material;;Tarjeta;;;"Dijo ""urgente"""')
    expect(lines[2]).toContain(';1500,50;Patrocinio;')
    expect(csv.startsWith(bom)).toBe(true)
  })
})

describe('presupuesto', () => {
  it('naranja desde el 80 % y rojo si se pasa', () => {
    expect(budgetState({ monthly: null, spent: 100 })).toBe(null)
    expect(budgetState({ monthly: 10000, spent: 5000 }).level).toBe('ok')
    expect(budgetState({ monthly: 10000, spent: 8000 }).level).toBe('warn')
    expect(budgetState({ monthly: 10000, spent: 10001 }).level).toBe('over')
    expect(budgetState({ monthly: 0, spent: 1 }).level).toBe('over')
  })
})

describe('formulario', () => {
  it('vacío, desde un movimiento y validado', () => {
    const empty = emptyMovementForm('2030-11-04')
    expect(empty).toMatchObject({ kind: 'gasto', day: '2030-11-04', category: 'dominio_web' })
    expect(formFromMovement(mov('a', { amount_cents: 2550 })).amount).toBe('25,50')
    expect(validateMovementForm({ ...empty, concept: '', amount: '0' })).toMatchObject({ concept: expect.any(String), amount: expect.any(String) })
    expect(validateMovementForm({ ...empty, concept: 'Dominio', amount: '12', category: 'patrocinio' })).toMatchObject({ category: expect.any(String) })
    expect(validateMovementForm({ ...empty, concept: 'Dominio', amount: '12,99' })).toEqual({})
  })
})

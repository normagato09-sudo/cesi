import { describe, expect, it } from 'vitest'
import { cellIndexFromPoint } from './monthGrid'

// Casillas de 100 × 130 px con 1 px de separación, como en la vista Mes.
function cells(weeks) {
  const rects = []
  for (let row = 0; row < weeks; row++) {
    for (let col = 0; col < 7; col++) {
      const left = col * 101
      const top = 100 + row * 131
      rects.push({ left, right: left + 100, top, bottom: top + 130 })
    }
  }
  return rects
}

describe('casilla del mes bajo el puntero (cellIndexFromPoint)', () => {
  it('en un mes de 5 semanas (la rejilla reserva 6 filas) no salta a la fila de arriba', () => {
    const rects = cells(5)
    // Centro del domingo de la 4.ª semana (índice 27).
    expect(cellIndexFromPoint(rects, 6 * 101 + 50, 100 + 3 * 131 + 65)).toBe(27)
    // Un poco más abajo y a la izquierda, ya en el sábado de la 5.ª semana.
    expect(cellIndexFromPoint(rects, 5 * 101 + 50, 100 + 4 * 131 + 10)).toBe(33)
  })

  it('fuera de la rejilla toma la casilla más cercana', () => {
    const rects = cells(5)
    expect(cellIndexFromPoint(rects, -50, 0)).toBe(0)
    expect(cellIndexFromPoint(rects, 5000, 5000)).toBe(34)
  })

  it('sin casillas no hay índice', () => {
    expect(cellIndexFromPoint([], 10, 10)).toBe(null)
  })
})

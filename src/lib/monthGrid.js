// Casilla de la rejilla del mes que hay bajo el punto (x, y), medida sobre las casillas reales
// (`rects`, en orden, `cols` por fila). No se puede dividir el alto de la rejilla entre las semanas:
// reserva siempre 6 filas, y en un mes de 5 semanas la última queda vacía. Fuera de la rejilla se
// toma la casilla más cercana.
export function cellIndexFromPoint(rects, x, y, cols = 7) {
  if (!rects.length) return null
  const rows = Math.ceil(rects.length / cols)
  let col = 0
  while (col < cols - 1 && x >= rects[col].right) col++
  let row = 0
  while (row < rows - 1 && y >= rects[row * cols].bottom) row++
  return Math.min(rects.length - 1, row * cols + col)
}

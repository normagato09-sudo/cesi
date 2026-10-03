// Error que usa el formulario para mostrar los avisos con "Guardar igualmente".
export class MeetingWarningError extends Error {
  constructor(violations) {
    super(violations.map((v) => v.message).join(' '))
    this.violations = violations
  }
}

// Título de los avisos que no bloquean al guardar una reunión (formulario, mover y redimensionar):
// solo hay avisos de participantes que no pueden según su disponibilidad ('participants').
export function warningTitle() {
  return 'Hay participantes que no pueden'
}

// ¿Alguno de los avisos es de participantes que no pueden? (entonces se ofrece "Buscar otro hueco")
export function hasUnavailableWarning(violations) {
  return violations.some((v) => v.type === 'participants')
}

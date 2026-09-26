// Título de los avisos que no bloquean al guardar una reunión (formulario, mover y redimensionar):
// reglas por tipo (type 'rule'), margen entre reuniones ('buffer') y participantes que no
// pueden según su disponibilidad ('participants').
export function warningTitle(violations) {
  const rules = violations.some((v) => v.type === 'rule' || !v.type)
  const buffer = violations.some((v) => v.type === 'buffer')
  const people = violations.some((v) => v.type === 'participants')
  if (people && !rules && !buffer) return 'Hay participantes que no pueden'
  if (people) return 'Revisa estos avisos antes de guardar'
  if (rules && buffer) return 'Esta reunión no cumple tus reglas ni el margen entre reuniones'
  if (buffer) return 'Esta reunión no respeta el margen entre reuniones'
  return 'Esta reunión no cumple tus reglas'
}

// ¿Alguno de los avisos es de participantes que no pueden? (entonces se ofrece "Buscar otro hueco")
export function hasUnavailableWarning(violations) {
  return violations.some((v) => v.type === 'participants')
}

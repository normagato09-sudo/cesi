// Distancia mínima (px) que debe recorrer el puntero antes de considerar que el usuario
// está arrastrando en lugar de simplemente tocando/haciendo clic. El umbral es mayor en
// touch porque el dedo tiene más "jitter" natural que un ratón.
const MOUSE_THRESHOLD = 4
const TOUCH_THRESHOLD = 10

export function dragThresholdFor(pointerType) {
  return pointerType === 'touch' || pointerType === 'pen' ? TOUCH_THRESHOLD : MOUSE_THRESHOLD
}

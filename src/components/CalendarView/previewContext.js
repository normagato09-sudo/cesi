import { createContext } from 'react'

// Cuenta de quien mira el calendario (para poner «Tú» en las respuestas de una reunión en la
// tarjeta rápida, EventPreview.jsx). Sin ella, las respuestas salen con los nombres.
export const PreviewMeContext = createContext(null)

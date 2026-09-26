import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import SyncGate from './components/SyncGate.jsx'
import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill'
import flagFontUrl from 'country-flag-emoji-polyfill/dist/TwemojiCountryFlags.woff2?url'

// Chrome y Edge en Windows no dibujan las banderas emoji (salen "ES", "MX"): solo en ellos se
// carga una fuente con las banderas, servida por la propia app (funciona sin conexión).
polyfillCountryFlagEmojis('Twemoji Country Flags', flagFontUrl)

// El conversor de hora ya no existe: se borran los últimos países que guardaba.
try {
  localStorage.removeItem('cesi_converter_recent_v1')
} catch {
  // Sin acceso a localStorage no hay nada que limpiar.
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SyncGate />
  </StrictMode>,
)

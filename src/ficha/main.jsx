import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill'
import flagFontUrl from 'country-flag-emoji-polyfill/dist/TwemojiCountryFlags.woff2?url'
import '../index.css'
import FichaPage from './FichaPage.jsx'

// Página pública /ficha/<token>: aparte de la app (no carga el calendario ni los datos de nadie).
polyfillCountryFlagEmojis('Twemoji Country Flags', flagFontUrl)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <FichaPage />
  </StrictMode>,
)

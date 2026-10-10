import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill'
import flagFontUrl from 'country-flag-emoji-polyfill/dist/TwemojiCountryFlags.woff2?url'
import '../index.css'
import ReservarPage from './ReservarPage.jsx'

// Página pública /reservar/<token>: aparte de la app (no carga el calendario ni los datos de nadie).

// Banderas del selector de país también en Chrome y Edge para Windows.
polyfillCountryFlagEmojis('Twemoji Country Flags', flagFontUrl)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ReservarPage />
  </StrictMode>,
)

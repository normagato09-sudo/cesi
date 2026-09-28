import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import ConfirmPage from './ConfirmPage.jsx'

// Página pública /confirmar/<token>: aparte de la app (no carga el calendario ni los datos de nadie).
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ConfirmPage />
  </StrictMode>,
)

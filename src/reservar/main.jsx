import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import ReservarPage from './ReservarPage.jsx'

// Página pública /reservar/<token>: aparte de la app (no carga el calendario ni los datos de nadie).
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ReservarPage />
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import VacantesPage from './VacantesPage.jsx'

// Página pública /vacantes (parte 40): sin cuenta, para compartir fuera del Discord.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <VacantesPage />
  </StrictMode>,
)

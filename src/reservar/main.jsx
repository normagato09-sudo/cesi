import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import ReservarClosed from './ReservarClosed.jsx'

// Página pública /reservar/<token>. El enlace de reservas ya no se usa: cualquier enlace muestra
// que ya no está disponible (la página antigua sigue en ReservarPage.jsx, sin usarse; los datos y
// las tablas de Supabase se conservan).
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ReservarClosed />
  </StrictMode>,
)

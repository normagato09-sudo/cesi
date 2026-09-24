import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// El conversor de hora ya no existe: se borran los últimos países que guardaba.
try {
  localStorage.removeItem('cesi_converter_recent_v1')
} catch {
  // Sin acceso a localStorage no hay nada que limpiar.
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

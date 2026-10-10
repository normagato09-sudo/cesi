import { useEffect, useRef, useState } from 'react'
import { Ellipsis } from 'lucide-react'
import { MAIN_SECTIONS, MORE_SECTIONS, sectionActive } from './sections.js'
import './MobileNav.css'

// Barra inferior del móvil: Inicio, Calendario, Tareas, Contactos y "Más" (Equipo,
// y debajo `actions`: [{ id, label, Icon, onClick }], p. ej. "Enlace de reservas").
// En el ordenador no se ve: están todas en la barra lateral.
export default function MobileNav({ section, onSectionChange, actions = [] }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const ref = useRef(null)
  const inMore = MORE_SECTIONS.some((s) => s.id === section)

  useEffect(() => {
    if (!moreOpen) return
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !ref.current?.contains(e.target)) setMoreOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [moreOpen])

  const go = (id) => {
    setMoreOpen(false)
    onSectionChange(id)
  }

  return (
    <nav className="mobile-nav" aria-label="Secciones" ref={ref}>
      {MAIN_SECTIONS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={`mobile-nav-item${sectionActive(id, section) ? ' active' : ''}`}
          aria-current={sectionActive(id, section) ? 'page' : undefined}
          onClick={() => go(id)}
        >
          <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
      <button
        type="button"
        className={`mobile-nav-item${inMore || moreOpen ? ' active' : ''}`}
        aria-expanded={moreOpen}
        aria-haspopup="menu"
        onClick={() => setMoreOpen((open) => !open)}
      >
        <Ellipsis size={22} strokeWidth={1.75} aria-hidden="true" />
        <span>Más</span>
      </button>

      {moreOpen && (
        <div className="mobile-nav-more" role="menu" aria-label="Más secciones">
          {MORE_SECTIONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              className={`mobile-nav-more-item${section === id ? ' active' : ''}`}
              aria-current={section === id ? 'page' : undefined}
              onClick={() => go(id)}
            >
              <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
              {label}
            </button>
          ))}
          {actions.map(({ id, label, Icon, onClick }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              className="mobile-nav-more-item"
              onClick={() => {
                setMoreOpen(false)
                onClick()
              }}
            >
              <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      )}
    </nav>
  )
}

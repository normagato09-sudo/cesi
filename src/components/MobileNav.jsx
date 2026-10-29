import { useEffect, useRef, useState } from 'react'
import { Ellipsis } from 'lucide-react'
import { ceoGroups, groupOfSection, sectionActive } from './sections.js'
import './MobileNav.css'

// Barra inferior del móvil: un botón por grupo del menú (Mi panel, Agenda, Equipo, Formación).
// Si el grupo tiene varias pantallas, al pulsarlo se elige una encima de la barra. «Más» solo
// sale si hay `actions`: [{ id, label, Icon, onClick }], p. ej. "Enlace de reservas".
// En el ordenador no se ve: están todas en la barra lateral.
export default function MobileNav({ section, onSectionChange, actions = [], showAccess = false, groups = null }) {
  const [openMenu, setOpenMenu] = useState(null) // id del grupo, 'more' o null
  const ref = useRef(null)
  const navGroups = groups || ceoGroups(showAccess)
  const activeGroup = groupOfSection(navGroups, section)

  useEffect(() => {
    if (!openMenu) return
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !ref.current?.contains(e.target)) setOpenMenu(null)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [openMenu])

  const go = (id) => {
    setOpenMenu(null)
    onSectionChange(id)
  }

  const handleGroup = (group) => {
    if (group.items.length === 1) go(group.items[0].id)
    else setOpenMenu((open) => (open === group.id ? null : group.id))
  }

  const menuGroup = navGroups.find((g) => g.id === openMenu) || null

  return (
    <nav className="mobile-nav" aria-label="Secciones" ref={ref}>
      {navGroups.map((group) => {
        const { id, label, Icon } = group
        const active = activeGroup?.id === id
        const single = group.items.length === 1
        return (
          <button
            key={id}
            type="button"
            className={`mobile-nav-item${active || openMenu === id ? ' active' : ''}`}
            aria-current={active ? 'page' : undefined}
            aria-expanded={single ? undefined : openMenu === id}
            aria-haspopup={single ? undefined : 'menu'}
            onClick={() => handleGroup(group)}
          >
            <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
            <span>{label}</span>
          </button>
        )
      })}
      {actions.length > 0 && (
        <button
          type="button"
          className={`mobile-nav-item${openMenu === 'more' ? ' active' : ''}`}
          aria-expanded={openMenu === 'more'}
          aria-haspopup="menu"
          onClick={() => setOpenMenu((open) => (open === 'more' ? null : 'more'))}
        >
          <Ellipsis size={22} strokeWidth={1.75} aria-hidden="true" />
          <span>Más</span>
        </button>
      )}

      {menuGroup && (
        <div className="mobile-nav-more" role="menu" aria-label={menuGroup.label}>
          <span className="mobile-nav-more-title">{menuGroup.label}</span>
          {menuGroup.items.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              className={`mobile-nav-more-item${sectionActive(id, section) ? ' active' : ''}`}
              aria-current={sectionActive(id, section) ? 'page' : undefined}
              onClick={() => go(id)}
            >
              <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      )}

      {openMenu === 'more' && (
        <div className="mobile-nav-more" role="menu" aria-label="Más">
          {actions.map(({ id, label, Icon, onClick }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              className="mobile-nav-more-item"
              onClick={() => {
                setOpenMenu(null)
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

import { useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Crown } from 'lucide-react'
import ContactAvatar from './ContactAvatar.jsx'
import { quoteDisplay } from '../lib/team'
import { tenure, tenureText } from '../lib/trajectory'
import { moveItem, positionIn, roleIn } from '../lib/teamOrder'

export const HEAD_LABEL = 'Jefe/a de departamento'

// Arrastrar solo con ratón: en las pantallas táctiles se ordena con «Ordenar».
const finePointer = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches

function MemberCard({ contact, area, isHead, now, onOpen }) {
  const p = contact.teamProfile
  const seniority = tenureText(tenure(p, now))
  const role = roleIn(contact, area)
  return (
    <button type="button" className="team-card" onClick={() => onOpen(contact.id)}>
      <ContactAvatar name={contact.name} photo={contact.photo} size="xl" />
      <span className="team-card-name">{contact.name}</span>
      {isHead && (
        <span className="team-card-head">
          <Crown size={12} strokeWidth={2} aria-hidden="true" />
          {HEAD_LABEL}
        </span>
      )}
      {role && <span className="team-card-role">{role}</span>}
      {quoteDisplay(p.quote) && (
        <span className="team-card-quote" title={quoteDisplay(p.quote)}>
          {quoteDisplay(p.quote)}
        </span>
      )}
      {seniority && <span className="team-card-seniority">{seniority}</span>}
    </button>
  )
}

// Móvil: la lista del departamento con flechas para subir y bajar a cada persona, y «Listo».
function SortList({ members, area, onReorder }) {
  const move = (index, delta) => onReorder(area, moveItem(members, index, index + delta))
  return (
    <ol className="team-sort-list">
      {members.map((c, index) => (
        <li key={c.id} className="team-sort-row">
          <span className="team-sort-pos">{index + 1}</span>
          <ContactAvatar name={c.name} photo={c.photo} />
          <span className="team-sort-name">
            {c.name}
            {roleIn(c, area) && <span>{roleIn(c, area)}</span>}
          </span>
          <button type="button" className="team-sort-arrow" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Subir a ${c.name}`}>
            <ArrowUp size={18} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="team-sort-arrow"
            onClick={() => move(index, 1)}
            disabled={index === members.length - 1}
            aria-label={`Bajar a ${c.name}`}
          >
            <ArrowDown size={18} strokeWidth={2} />
          </button>
        </li>
      ))}
    </ol>
  )
}

/**
 * Equipo agrupado por departamentos (ver teamOrder.js), cada uno con sus personas en su orden; la
 * primera, si ya se ha ordenado, lleva «Jefe/a de departamento». Con `canReorder` (sin búsqueda):
 * en el ordenador se ordena arrastrando las tarjetas; en el móvil, con «Ordenar» (flechas) y
 * «Listo». onReorder(area, contactosEnSuOrden). `renderAfter(group)`: lo que va debajo de las
 * personas de cada departamento.
 */
export default function TeamGroups({ groups, now, canReorder, onOpen, onReorder, renderAfter = null }) {
  const [sorting, setSorting] = useState(null) // departamento que se está ordenando en el móvil
  const [drag, setDrag] = useState(null) // { area, id }
  const [over, setOver] = useState(null)
  const [canDrag] = useState(finePointer)

  const handleDrop = (group, targetId) => {
    if (!drag || drag.area !== group.area) return
    const from = group.members.findIndex((c) => c.id === drag.id)
    const to = group.members.findIndex((c) => c.id === targetId)
    if (from >= 0 && to >= 0 && from !== to) onReorder(group.area, moveItem(group.members, from, to))
    setDrag(null)
    setOver(null)
  }

  return (
    <div className="team-groups">
      {groups.map((group) => {
        const { area, label, members } = group
        const reorderable = canReorder && members.length > 1
        const isSorting = reorderable && sorting === area
        return (
          <section key={area || '__none__'} className="team-group" aria-label={label}>
            <header className="team-group-header">
              <h2>
                {label}
                <span className="team-group-count">{members.length}</span>
              </h2>
              {reorderable &&
                (isSorting ? (
                  <button type="button" className="team-sort-btn done" onClick={() => setSorting(null)}>
                    <Check size={16} strokeWidth={2} />
                    Listo
                  </button>
                ) : (
                  <button type="button" className="team-sort-btn" onClick={() => setSorting(area)}>
                    <ArrowUpDown size={15} strokeWidth={1.75} />
                    Ordenar
                  </button>
                ))}
            </header>

            {isSorting ? (
              <SortList members={members} area={area} onReorder={onReorder} />
            ) : members.length === 0 ? (
              <p className="team-group-empty">Nadie en este departamento todavía.</p>
            ) : (
              <ul className="team-grid">
                {members.map((c, index) => (
                  <li
                    key={c.id}
                    className={`team-grid-item${reorderable && canDrag ? ' draggable' : ''}${drag?.id === c.id && drag.area === area ? ' dragging' : ''}${over === `${area}:${c.id}` && drag?.id !== c.id ? ' drop-target' : ''}`}
                    draggable={reorderable && canDrag}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', c.id)
                      setDrag({ area, id: c.id })
                    }}
                    onDragOver={(e) => {
                      if (drag?.area !== area) return
                      e.preventDefault()
                      setOver(`${area}:${c.id}`)
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      handleDrop(group, c.id)
                    }}
                    onDragEnd={() => {
                      setDrag(null)
                      setOver(null)
                    }}
                    title={reorderable && canDrag ? 'Arrastra para cambiar el orden' : undefined}
                  >
                    <MemberCard contact={c} area={area} isHead={index === 0 && !!area && positionIn(c, area) !== null} now={now} onOpen={onOpen} />
                  </li>
                ))}
              </ul>
            )}
            {renderAfter?.(group)}
          </section>
        )
      })}
    </div>
  )
}

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import MeetingFormModal from './MeetingFormModal.jsx'

// Sin navegador en las pruebas: la ventana se pinta en su sitio, sin portal.
globalThis.document ??= { body: null }
vi.mock('react-dom', async (original) => ({ ...(await original()), createPortal: (node) => node }))

const render = (props) =>
  renderToStaticMarkup(createElement(MeetingFormModal, { client: null, meId: 'yo', zone: 'Europe/Madrid', onClose: () => {}, onSaved: () => {}, ...props }))
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

const team = { id: 't1', name: 'Gabriel Ruiz', teamProfile: { status: 'active', area: 'Media', roles: [] } }
const external = { id: 'x1', name: 'Ana Externa', email: 'ana@x.com' }

describe('formulario «Nueva reunión»', () => {
  it('la ceo: Reunión | No disponible, equipo y alumnos sin cuenta (los externos, al buscar)', () => {
    const html = render({ isCeo: true, contacts: [team, external], students: [{ id: 's1', name: 'Lucía' }] })
    const t = text(html)
    expect(t).toContain('Nueva reunión')
    expect(t).toContain('Horas en tu zona: Europa/Madrid')
    expect(t).toContain('No disponible')
    expect(t).toContain('Gabriel Ruiz')
    expect(t).toContain('Sin cuenta')
    expect(t).toContain('Lucía')
    expect(t).not.toContain('Ana Externa')
    expect(t).toContain('¿Cuándo les va bien?')
    expect(t).toContain('Crear reunión')
    expect(t).toContain('Más opciones')
  })

  it('al editar un evento mío, todo relleno y sin cambiar de tipo', () => {
    const event = { id: 'e', title: 'Claustro', start: '2026-11-05T17:00:00.000Z', end: '2026-11-05T18:00:00.000Z', participantIds: ['x1'], guests: [], location: 'Sala 2' }
    const html = render({ isCeo: true, contacts: [external], event })
    expect(html).toContain('value="Claustro"')
    expect(html).toContain('value="Sala 2"')
    expect(text(html)).toContain('Editar reunión')
    expect(text(html)).toContain('Ana Externa')
    expect(text(html)).toContain('Guardar cambios')
    expect(html).not.toContain('mf-switch')
  })

  it('el equipo y los alumnos: sin «No disponible»', () => {
    const html = render({})
    expect(html).not.toContain('mf-switch')
    expect(text(html)).toContain('Crear reunión')
  })
})

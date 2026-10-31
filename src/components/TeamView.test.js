import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import TeamView from './TeamView.jsx'
import { newVacancy } from '../lib/vacancies'

const render = (props) => renderToStaticMarkup(createElement(TeamView, props))
const noop = () => {}
const now = new Date(2026, 9, 8, 12, 0)

const role = (id, title, area) => ({ id, role: title, area, start: '2025-01-01', end: null })
const ana = { id: 'ana', name: 'Ana', email: 'ana@cesi.org', teamProfile: { status: 'active', area: 'Moderación', roles: [role('r1', 'Moderadora', 'Moderación')], order: { Moderación: 0 } } }
const bea = { id: 'bea', name: 'Bea', teamProfile: { status: 'active', area: 'Moderación', roles: [role('r2', 'Moderadora', 'Moderación')] } }
const old = { id: 'old', name: 'Antiguo', teamProfile: { status: 'former', area: 'Moderación', roles: [], formerGroupHandled: true } }

const base = {
  contacts: [ana, bea, old],
  groups: [],
  rawEvents: [],
  now,
  areas: ['Moderación', 'Radio'],
  vacancies: [
    { id: 'v1', ...newVacancy({ title: 'Locutor/a', area: 'Radio', status: 'open' }) },
    { id: 'v2', ...newVacancy({ title: 'Moderador/a', area: 'Moderación', status: 'filled' }) },
  ],
  selectedMemberId: null,
  onSelectMember: noop,
}

describe('TeamView', () => {
  it('agrupa por área, con el jefe arriba, sin las vacantes (están en «Vacantes»)', () => {
    const html = render(base)
    expect(html.indexOf('Ana')).toBeLessThan(html.indexOf('Bea'))
    expect(html).toContain('Jefe/a de departamento')
    expect(html).not.toContain('Antiguo')
    expect(html).not.toContain('Locutor/a')
    expect(html).not.toContain('Nueva vacante')
    expect(html).not.toContain('Departamentos')
    expect(html).not.toContain('Ordenar por')
  })

  it('avisa de quién ha quedado en «Sin área» al pasar a las áreas', () => {
    const leo = { id: 'leo', name: 'Leo', teamProfile: { status: 'active', area: '', legacyArea: 'Tienda', roles: [role('r3', 'Tendero', '')] } }
    const html = render({ ...base, contacts: [ana, leo] })
    expect(html).toContain('Sin área')
    expect(html).toContain('Leo')
    expect(html).toContain('antes: Tienda')
  })

  it('la ficha lo junta todo con un solo «Editar»', () => {
    const html = render({ ...base, selectedMemberId: 'ana' })
    expect(html).toContain('Buscar hueco con esta persona')
    expect(html).toContain('>Editar<')
    expect(html).not.toContain('Ficha de contacto')
    expect(html).not.toContain('Editar perfil')
    // Las tareas antiguas ya no salen (las del equipo están en Tareas).
    expect(html).not.toContain('Tareas pendientes')
    expect(html).toContain('ana@cesi.org')
    expect(html).toContain('Jefe/a de departamento: Moderación')
  })
})

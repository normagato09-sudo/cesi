import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ContactsView from '../ContactsView.jsx'
import TeamView from '../TeamView.jsx'
import StudentsView from '../StudentsView.jsx'
import { memberGroups } from '../sections.js'
import { NO_ATTENDANCE_ACTIONS, normalizeScreenData } from '../../lib/screenData'

const noop = () => {}
const now = new Date(2026, 10, 2, 12, 0)
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('pantallas de la ceo para el equipo (solo lectura)', () => {
  it('el menú del equipo: solo las pantallas con permiso, sin «Buscar hueco»', () => {
    const items = memberGroups({ contactos: 'read', alumnos: 'write', cursos: 'none' }).flatMap((g) => g.items.map((i) => i.id))
    expect(items).toContain('contacts')
    expect(items).toContain('students')
    expect(items).not.toContain('courses')
    expect(items).not.toContain('slots')
  })

  it('los datos llegan como en la app de la ceo (contactos antiguos sin país, cursos normalizados)', () => {
    const data = normalizeScreenData({ level: 'read', contacts: [{ id: 'b', name: 'Bea' }, { id: 'a', name: 'Ana', country: 'MX', timeZone: 'America/Mexico_City' }] })
    expect(data.contacts.map((c) => c.id)).toEqual(['a', 'b'])
    expect(data.contacts[1]).toMatchObject({ country: 'ES', countryUnreviewed: true })
    expect(data.students).toEqual([])
  })

  it('Contactos externos: sin crear, editar, archivar ni borrar', () => {
    const contacts = [{ id: 'c1', name: 'Externa', organization: 'ACME', country: 'ES', timeZone: 'Europe/Madrid' }]
    const html = renderToStaticMarkup(
      createElement(ContactsView, { readOnly: true, contacts, groups: [], rawEvents: [], now, selectedContactId: 'c1', onSelectContact: noop }),
    )
    const t = text(html)
    expect(t).toContain('Externa')
    expect(t).not.toContain('Nuevo contacto')
    expect(t).not.toContain('Gestionar grupos')
    expect(t).not.toContain('Editar')
    expect(t).not.toContain('Eliminar')
    expect(t).not.toContain('Archivar')
  })

  it('Equipo: la ficha sin acciones y sin ordenar', () => {
    const ana = { id: 'ana', name: 'Ana', teamProfile: { status: 'active', area: 'Media', roles: [{ id: 'r', role: 'Diseñadora', area: 'Media', start: '2025-01-01', end: null }] } }
    const html = renderToStaticMarkup(
      createElement(TeamView, { readOnly: true, contacts: [ana], groups: [], rawEvents: [], now, areas: ['Media'], selectedMemberId: 'ana', onSelectMember: noop }),
    )
    const t = text(html)
    expect(t).toContain('Ana')
    expect(t).not.toContain('Quitar del equipo')
    expect(t).not.toContain('Nueva reunión')
    expect(t).not.toContain('Añadir rol')
  })

  it('Alumnos: sin crear ni editar', () => {
    const students = [{ id: 's1', name: 'Lucía', country: 'ES', timeZone: 'Europe/Madrid', courseIds: [] }]
    const html = renderToStaticMarkup(
      createElement(StudentsView, {
        readOnly: true,
        tab: 'students',
        students,
        courses: [],
        attendanceActions: NO_ATTENDANCE_ACTIONS,
        now,
        selectedStudentId: 's1',
        onSelectStudent: noop,
      }),
    )
    const t = text(html)
    expect(t).toContain('Lucía')
    expect(t).not.toContain('Nuevo alumno')
    expect(t).not.toContain('Gestionar cursos')
    expect(t).not.toContain('Eliminar')
  })
})

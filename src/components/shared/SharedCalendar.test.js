import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import SharedCalendar from './SharedCalendar.jsx'
import { memberCalendarEvents } from '../../lib/sharedCalendar'

describe('calendario del equipo y de los alumnos', () => {
  it('es el mismo calendario (Mes, Semana, Día) con la zona de su perfil', () => {
    const html = renderToStaticMarkup(createElement(SharedCalendar, { client: null, meId: 'yo', zone: 'Europe/Madrid' }))
    expect(html).toContain('Mes')
    expect(html).toContain('Semana')
    expect(html).toContain('Día')
    expect(html).toContain('Horas en tu zona')
    // Sin cuenta (vista previa), no se pueden crear reuniones.
    expect(html).not.toContain('Nueva reunión')
  })

  it('sus reuniones y clases, de solo lectura y con su etiqueta', () => {
    const meeting = { id: 'm', title: 'Reunión', starts_at: '2026-11-02T10:00:00Z', ends_at: '2026-11-02T11:00:00Z', cancelled: false, my_status: 'pending', organizer_id: 'otra', participants: [] }
    const cls = { course_id: 'c', class_key: 'k', course_name: 'Doblaje', starts_at: '2026-11-03T10:00:00Z', ends_at: '2026-11-03T11:00:00Z', kind: 'alumno', teacher_name: 'Ana', my_status: 'yes' }
    const [m, c] = memberCalendarEvents([meeting], [cls], 'yo')
    expect(m).toMatchObject({ shared: true, badge: 'Pendiente', title: 'Reunión' })
    expect(c).toMatchObject({ shared: true, badge: 'Clase · Ana · Vas', title: 'Doblaje' })
    expect(c.item.kind).toBe('class')
  })
})

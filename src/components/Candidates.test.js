import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import CandidateFormModal from './CandidateFormModal.jsx'
import AcceptRoleModal from './AcceptRoleModal.jsx'
import TeamTrajectory from './TeamTrajectory.jsx'
import VacanciesView from './VacanciesView.jsx'
import { newCandidacy, newVacancy } from '../lib/vacancies'

const render = (component, props) => renderToStaticMarkup(createElement(component, props))
const noop = () => {}
const now = new Date(2026, 8, 29, 12, 0)

const vacancy = { id: 'v1', ...newVacancy({ title: 'Profesora de doblaje', area: 'Doblaje', openedAt: '2026-09-01' }) }
const other = { id: 'v2', ...newVacancy({ title: 'Locutor/a', area: 'Radio', openedAt: '2026-09-10' }) }
const roles = [
  { id: 'r1', role: 'Jefe de Ciberseguridad', area: 'Ciberseguridad', start: '2026-09-27', end: null },
  { id: 'r2', role: 'Profesor', area: 'Profesores', start: '2026-02-24', end: null },
]
const member = {
  id: 'm',
  name: 'Dev',
  email: 'dev@cesi.es',
  teamProfile: { status: 'active', role: 'Jefe de Ciberseguridad', area: 'Ciberseguridad', roles },
  candidacies: [
    { ...newCandidacy('v1', { appliedAt: '2026-09-20' }), id: 'cand-1', notes: 'Muy buena voz' },
    { ...newCandidacy('v2', { appliedAt: '2026-09-21' }), id: 'cand-2' },
  ],
}
const contacts = [member, { id: 'x', name: 'Ana Pérez', email: 'ana@x.com' }]

describe('formulario de candidatura', () => {
  it('al añadir se puede elegir un contacto existente o una persona nueva', () => {
    const html = render(CandidateFormModal, { vacancy, contacts, onSubmit: noop, onClose: noop })
    expect(html).toContain('Contacto existente')
    expect(html).toContain('Persona nueva')
    expect(html).toContain('Añadir candidatura')
  })

  it('al editar la candidatura de un miembro, sus datos de contacto no se cambian aquí', () => {
    const html = render(CandidateFormModal, { vacancy, contacts, initial: { contact: member, candidacy: member.candidacies[0] }, onSubmit: noop, onClose: noop })
    expect(html).toContain('Ya es del equipo')
    expect(html).toContain('Muy buena voz')
    expect(html).not.toContain('Nombre y apellidos')
  })
})

describe('aceptar a alguien que ya es del equipo', () => {
  it('pregunta si el nuevo rol se suma o sustituye', () => {
    const html = render(AcceptRoleModal, { contact: member, vacancy, areas: ['Doblaje'], now, onSave: noop, onClose: noop })
    expect(html).toContain('¿Qué pasa con sus roles actuales?')
    expect(html).toContain('Se suma')
    expect(html).toContain('Sustituye')
    expect(html).not.toMatch(/type="radio"[^>]*checked/)
  })

  it('a un antiguo miembro no le pregunta: vuelve al equipo', () => {
    const former = { ...member, teamProfile: { status: 'former', roles: [{ ...roles[1], end: '2026-06-01' }] } }
    const html = render(AcceptRoleModal, { contact: former, vacancy, now, onSave: noop, onClose: noop })
    expect(html).toContain('Vuelve al equipo')
    expect(html).not.toContain('¿Qué pasa con sus roles actuales?')
  })
})

describe('trayectoria y candidaturas en pantalla', () => {
  it('la trayectoria muestra los dos roles actuales y el tiempo total sin contar dos veces', () => {
    const html = render(TeamTrajectory, { profile: member.teamProfile, now })
    expect(html).toContain('7 meses y 5 días en CESI')
    expect(html.match(/trajectory-badge/g)).toHaveLength(2)
  })

  it('la ficha de una candidatura dice si ya es del equipo y a qué más se ha presentado', () => {
    const html = render(VacanciesView, {
      vacancies: [vacancy, other],
      contacts,
      rawEvents: [],
      now,
      areas: [],
      selectedVacancyId: 'v1',
      onSelectVacancy: noop,
      selectedCandidacyId: 'cand-1',
      onSelectCandidacy: noop,
    })
    expect(html).toContain('Ya es del equipo')
    expect(html).toContain('También se ha presentado a')
    expect(html).toContain('Locutor/a')
    expect(html).toContain('Muy buena voz')
  })

  it('en la vacante salen sus candidaturas', () => {
    const html = render(VacanciesView, {
      vacancies: [vacancy, other],
      contacts,
      rawEvents: [],
      now,
      areas: [],
      selectedVacancyId: 'v2',
      onSelectVacancy: noop,
      selectedCandidacyId: null,
      onSelectCandidacy: noop,
    })
    expect(html).toContain('Dev')
  })
})

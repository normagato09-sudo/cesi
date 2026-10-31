import { describe, expect, it } from 'vitest'
import {
  canAddGoal,
  emptyGoalForm,
  formFromGoal,
  goalPercent,
  goalProgressText,
  goalStatusLabel,
  goalsByArea,
  monthLabel,
  monthStart,
  splitUnclosed,
  taskMonth,
  validateGoalForm,
} from './goals'

const goal = (id, extra = {}) => ({
  id,
  title: id,
  area: 'media',
  month: '2030-11-01',
  status: 'en_curso',
  unclosed: false,
  parts_done: 0,
  parts_total: 0,
  owner_id: null,
  ...extra,
})

describe('meses', () => {
  it('primer día, nombre y mes de una tarea', () => {
    expect(monthStart('2030-11-17')).toBe('2030-11-01')
    expect(monthStart('2030-11')).toBe('2030-11-01')
    expect(monthLabel('2030-11-01')).toBe('noviembre de 2030')
    expect(taskMonth('2030-12-05', '2030-11-17')).toBe('2030-12-01')
    expect(taskMonth('', '2030-11-17')).toBe('2030-11-01')
  })
})

describe('objetivos', () => {
  it('estado: «Sin cerrar» si es de un mes pasado y sigue en curso', () => {
    expect(goalStatusLabel(goal('a'))).toBe('En curso')
    expect(goalStatusLabel(goal('a', { status: 'conseguido' }))).toBe('Conseguido')
    expect(goalStatusLabel(goal('a', { unclosed: true }))).toBe('Sin cerrar')
  })

  it('progreso: partes hechas / total', () => {
    expect(goalPercent(goal('a', { parts_done: 3, parts_total: 8 }))).toBe(38)
    expect(goalPercent(goal('a'))).toBe(0)
    expect(goalProgressText(goal('a', { parts_done: 3, parts_total: 8 }))).toBe('3 de 8 partes hechas')
    expect(goalProgressText(goal('a', { parts_done: 1, parts_total: 1 }))).toBe('1 de 1 parte hecha')
    expect(goalProgressText(goal('a'))).toBe('Sin tareas')
  })

  it('por área, en su orden (con allAreas, también las vacías)', () => {
    const areas = [
      { id: 'media', name: 'Media' },
      { id: 'legal', name: 'Legal' },
    ]
    const goals = [goal('a', { area: 'legal' }), goal('b'), goal('c', { area: null })]
    expect(goalsByArea(goals, areas).map((g) => [g.id, g.goals.map((x) => x.id)])).toEqual([
      ['media', ['b']],
      ['legal', ['a']],
      ['', ['c']],
    ])
    expect(goalsByArea([goal('b')], areas, { allAreas: true }).map((g) => g.id)).toEqual(['media', 'legal'])
    expect(goalsByArea([goal('b')], areas).map((g) => g.id)).toEqual(['media'])
  })

  it('los «Sin cerrar» de meses anteriores aparte', () => {
    const { unclosed, current } = splitUnclosed([goal('viejo', { month: '2030-10-01', unclosed: true }), goal('nuevo')], '2030-11-01')
    expect(unclosed.map((g) => g.id)).toEqual(['viejo'])
    expect(current.map((g) => g.id)).toEqual(['nuevo'])
  })

  it('como mucho 3 por área y mes', () => {
    const goals = [goal('a'), goal('b'), goal('c', { area: 'legal' }), goal('d', { month: '2030-10-01' })]
    expect(canAddGoal(goals, 'media', '2030-11-01')).toBe(true)
    expect(canAddGoal([...goals, goal('e')], 'media', '2030-11-01')).toBe(false)
  })

  it('formulario', () => {
    expect(emptyGoalForm({ area: 'media', month: '2030-11-01' })).toMatchObject({ area: 'media', month: '2030-11-01', owner: '', status: 'en_curso' })
    expect(formFromGoal(goal('a', { owner_id: 'ana', status: 'conseguido' }))).toMatchObject({ area: 'media', owner: 'ana', status: 'conseguido' })
    expect(validateGoalForm({ ...emptyGoalForm({ month: '' }), title: ' ' })).toMatchObject({
      title: expect.any(String),
      area: expect.any(String),
      month: expect.any(String),
    })
    expect(validateGoalForm({ ...emptyGoalForm({ area: 'media', month: '2030-11-01' }), title: 'Vender' })).toEqual({})
  })
})

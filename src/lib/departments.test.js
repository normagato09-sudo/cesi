import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DEPARTMENTS,
  LEGACY_DEFAULT_DEPARTMENTS,
  addDepartment,
  departmentUsage,
  moveDepartment,
  removeDepartment,
  renameDepartment,
  resolveDepartments,
  validateDepartmentName,
} from './departments'

const member = (id, area, status = 'active') => ({ id, name: id, teamProfile: { status, role: 'x', area, milestones: [] } })
const contacts = [member('ana', 'Radio'), member('luis', 'Media'), member('eva', 'Radio', 'former'), { id: 'x', name: 'Contacto' }]
const vacancies = [
  { id: 'v1', title: 'Locutor', area: 'Radio' },
  { id: 'v2', title: 'Editor', area: 'Media' },
  { id: 'v3', title: 'Sin', area: '' },
]
const list = ['Directivo', 'Media', 'Radio', 'Legal']

// Aplica los cambios como lo hace la app.
function apply(result) {
  const cs = contacts.map((c) => ({ ...c, ...(result.contactPatches.find((p) => p.id === c.id)?.patch || {}) }))
  const vs = vacancies.map((v) => ({ ...v, ...(result.vacancyPatches.find((p) => p.id === v.id)?.patch || {}) }))
  return { cs, vs }
}

describe('nombres de departamento', () => {
  it('no permite vacíos ni repetidos sin distinguir mayúsculas ni acentos', () => {
    expect(validateDepartmentName('   ', list)).toMatch(/Escribe/)
    expect(validateDepartmentName('RADIO', list)).toMatch(/Ya existe el departamento «Radio»/)
    expect(validateDepartmentName('Tecnico', ['Técnico'])).toMatch(/Ya existe/)
    expect(validateDepartmentName('Radio', list, 'Radio')).toBeNull()
    expect(addDepartment(list, 'legal')).toBe(list)
    expect(addDepartment(list, '  Tienda ')).toEqual([...list, 'Tienda'])
  })

  it('cuenta miembros (también antiguos) y vacantes que lo usan', () => {
    expect(departmentUsage('Radio', contacts, vacancies)).toEqual({ members: 2, vacancies: 1 })
    expect(departmentUsage('Legal', contacts, vacancies)).toEqual({ members: 0, vacancies: 0 })
  })

  it('sube y baja en la lista', () => {
    expect(moveDepartment(list, 2, -1)).toEqual(['Directivo', 'Radio', 'Media', 'Legal'])
    expect(moveDepartment(list, 0, -1)).toBe(list)
    expect(moveDepartment(list, 3, 1)).toBe(list)
  })
})

describe('renombrar', () => {
  it('cambia el nombre en su sitio y en todos los miembros y vacantes que lo tenían', () => {
    const result = renameDepartment(list, 'Radio', 'Radio y podcast', contacts, vacancies)
    expect(result.list).toEqual(['Directivo', 'Media', 'Radio y podcast', 'Legal'])
    const { cs, vs } = apply(result)
    expect(cs.map((c) => c.teamProfile?.area)).toEqual(['Radio y podcast', 'Media', 'Radio y podcast', undefined])
    expect(vs.map((v) => v.area)).toEqual(['Radio y podcast', 'Media', ''])
    // El resto del perfil se conserva.
    expect(cs[2].teamProfile.status).toBe('former')
  })

  it('no deja renombrar a un nombre que ya existe', () => {
    expect(renameDepartment(list, 'Radio', 'media', contacts, vacancies)).toEqual({ error: 'Ya existe el departamento «Media».' })
    // Cambiar solo mayúsculas del propio nombre sí se puede.
    expect(renameDepartment(list, 'Radio', 'RADIO', contacts, vacancies).list).toContain('RADIO')
  })
})

describe('borrar con reasignación', () => {
  it('pasa sus miembros y vacantes al departamento elegido', () => {
    const result = removeDepartment(list, 'Radio', 'Media', contacts, vacancies)
    expect(result.list).toEqual(['Directivo', 'Media', 'Legal'])
    const { cs, vs } = apply(result)
    expect(cs.filter((c) => c.teamProfile).map((c) => c.teamProfile.area)).toEqual(['Media', 'Media', 'Media'])
    expect(vs.map((v) => v.area)).toEqual(['Media', 'Media', ''])
  })

  it('o los deja sin departamento', () => {
    const { cs, vs } = apply(removeDepartment(list, 'Media', '', contacts, vacancies))
    expect(cs.find((c) => c.id === 'luis').teamProfile.area).toBe('')
    expect(vs.find((v) => v.id === 'v2').area).toBe('')
  })

  it('un departamento sin uso se borra sin cambios en nadie', () => {
    const result = removeDepartment(list, 'Legal', '', contacts, vacancies)
    expect(result).toMatchObject({ list: ['Directivo', 'Media', 'Radio'], contactPatches: [], vacancyPatches: [] })
  })

  it('no se puede pasar al mismo departamento ni a uno que no existe', () => {
    expect(removeDepartment(list, 'Radio', 'Radio', contacts, vacancies).error).toBeTruthy()
    expect(removeDepartment(list, 'Radio', 'Otro', contacts, vacancies).error).toBeTruthy()
  })
})

describe('migración de la lista de ejemplo', () => {
  it('la lista de ejemplo antigua se sustituye por la nueva (y hay que guardarla)', () => {
    const { list: next, changed } = resolveDepartments(LEGACY_DEFAULT_DEPARTMENTS, [], [])
    expect(next).toEqual(DEFAULT_DEPARTMENTS)
    expect(changed).toBe(true)
    expect(next.slice(0, 3)).toEqual(['Directivo', 'Alianzas', 'Moderación'])
  })

  it('conserva al final las áreas antiguas que aún usan miembros o vacantes', () => {
    const used = [member('ana', 'Doblaje'), member('luis', 'Radio'), member('eva', 'Profesorado')]
    const { list: next } = resolveDepartments(LEGACY_DEFAULT_DEPARTMENTS, used, [{ id: 'v', area: 'Coordinación' }])
    expect(next).toEqual([...DEFAULT_DEPARTMENTS, 'Doblaje', 'Profesorado', 'Coordinación'])
  })

  it('sin lista guardada empieza con la nueva', () => {
    expect(resolveDepartments(null, [], [])).toEqual({ list: DEFAULT_DEPARTMENTS, changed: true })
  })

  it('una lista ya cambiada por el usuario no se toca (aunque se parezca a la de ejemplo)', () => {
    const custom = [...LEGACY_DEFAULT_DEPARTMENTS, 'Producción']
    expect(resolveDepartments(custom, [], [])).toEqual({ list: custom, changed: false })
    const reordered = [...LEGACY_DEFAULT_DEPARTMENTS].reverse()
    expect(resolveDepartments(reordered, [], []).list).toEqual(reordered)
  })

  it('una lista ya migrada no vuelve a cambiar', () => {
    expect(resolveDepartments(DEFAULT_DEPARTMENTS, [member('a', 'Radio')], []).changed).toBe(false)
  })
})

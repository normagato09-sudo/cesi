import { describe, expect, it } from 'vitest'
import { exampleStudent, loadViewAsOptions } from './viewAsData'
import { formFromProfile, validatePortalForm } from '../../lib/studentPortal'

// Cliente falso de solo lectura: cada tabla devuelve sus filas; cualquier escritura falla.
function fakeClient(tables) {
  return {
    from(table) {
      const result = { data: tables[table] ?? [], error: tables[table] === undefined ? { code: 'PGRST205' } : null }
      const query = {
        select: () => query,
        order: () => query,
        eq: () => query,
        not: () => query,
        then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
      }
      for (const write of ['insert', 'update', 'upsert', 'delete']) {
        query[write] = () => {
          throw new Error(`escritura en ${table}`)
        }
      }
      return query
    },
  }
}

describe('exampleStudent', () => {
  it('es un perfil completo y válido', () => {
    const { profile, account } = exampleStudent()
    expect(validatePortalForm(formFromProfile(profile, account))).toEqual({})
  })
})

describe('loadViewAsOptions', () => {
  const client = fakeClient({
    profiles: [
      { id: 'a1', role: 'alumno', linked_student_id: 's1', email: 'ana@x.com', display_name: 'Ana' },
      { id: 'a2', role: 'alumno', linked_student_id: null, email: 'sin@x.com' },
      { id: 'e1', role: 'equipo', area: 'formacion', email: 'eva@x.com', display_name: 'Eva' },
      { id: 'c1', role: 'ceo', email: 'yo@x.com' },
    ],
    student_profiles: [{ id: 'a1', full_name: 'Ana López', completed_at: null }],
    areas: [{ id: 'formacion', name: 'Formación', sort: 2 }],
    area_permissions: [
      { area: 'formacion', screen: 'cursos', level: 'write' },
      { area: 'formacion', screen: 'calendario', level: 'read' },
    ],
    profile_permissions: [{ profile_id: 'e1', screen: 'calendario', level: 'none' }],
  })

  it('alumnos con cuenta unida, personas de equipo con sus permisos y áreas', async () => {
    const options = await loadViewAsOptions(client)
    expect(options.students.map((s) => s.label)).toEqual(['Ana López'])
    expect(options.students[0].detail).toContain('sin completar el perfil')
    expect(options.members).toHaveLength(1)
    expect(options.members[0].levels).toMatchObject({ cursos: 'write', calendario: 'none' })
    expect(options.areas[0].levels).toMatchObject({ cursos: 'write', calendario: 'read', fichajes: 'none' })
    expect(options.permsError).toBe(false)
  })
})

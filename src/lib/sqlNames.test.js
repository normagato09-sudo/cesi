import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { deleteTeamTask, saveTeamTask } from './teamWork'
import { deleteTask, gradeSubmission, listSubmissions, saveTask } from './courseTasks'

// Nombres de funciones y tablas de las partes nuevas (40 en adelante): ninguna puede llamarse como
// una de antes (eso cambiaría una función del equipo, como pasó con cesi_task_delete de la parte 7),
// salvo las de Calificaciones de la parte 36, que la parte 42 amplía a propósito con la misma firma.
const dir = new URL('../../supabase/', import.meta.url)
const read = (f) => readFileSync(new URL(f, dir), 'utf8').replace(/\r\n/g, '\n')
const partNo = (f) => Number(/^parte(\d+)_/.exec(f)?.[1] || 0)
const files = readdirSync(dir).filter((f) => f.endsWith('.sql'))
const NEW = files.filter((f) => partNo(f) >= 40 && !/comprobar/.test(f))
const OLD = files.filter((f) => (partNo(f) > 0 && partNo(f) < 40) || f === 'schema.sql' || f === 'fases-2-5.sql')
const ALLOWED = new Set(['cesi_grades_course', 'cesi_my_grades', 'cesi_grade_save', 'cesi_grade_delete'])

const defined = (sql) => new Set([...sql.matchAll(/create or replace function public\.([a-z0-9_]+)\(/g)].map((m) => m[1]))
const tables = (sql) => new Set([...sql.matchAll(/create table (?:if not exists )?public\.([a-z0-9_]+)/g)].map((m) => m[1]))

describe('SQL nuevo sin chocar con lo de antes', () => {
  const oldFns = new Set(OLD.flatMap((f) => [...defined(read(f))]))
  const oldTables = new Set(OLD.flatMap((f) => [...tables(read(f))]))

  it('ninguna función nueva se llama como una que ya existe (salvo las de Calificaciones)', () => {
    expect(NEW.length).toBeGreaterThanOrEqual(4)
    const clashes = NEW.flatMap((f) => [...defined(read(f))].filter((n) => oldFns.has(n) && !ALLOWED.has(n)).map((n) => `${f}: ${n}`))
    expect(clashes).toEqual([])
  })

  it('ninguna tabla nueva se llama como una que ya existe', () => {
    const clashes = NEW.flatMap((f) => [...tables(read(f))].filter((t) => oldTables.has(t)).map((t) => `${f}: ${t}`))
    expect(clashes).toEqual([])
  })

  it('las partes nuevas no borran ni cambian permisos de funciones del equipo', () => {
    for (const f of NEW) {
      const sql = read(f)
      expect(sql, f).not.toMatch(/drop function[^;]*cesi_task_(save|delete|set_status)\b/)
      expect(sql, f).not.toMatch(/(revoke|grant)[^;]*function public\.cesi_task_(save|delete|set_status)\(/)
      expect(sql, f).not.toMatch(/public\.cesi_team_tasks\(/)
    }
  })
})

describe('las tareas del equipo siguen igual', () => {
  const fakeClient = (calls) => ({
    rpc: async (name, args) => {
      calls.push({ name, args })
      return { data: name === 'cesi_course_task_delete' ? [] : null, error: null }
    },
    storage: { from: () => ({ remove: async () => ({}) }) },
  })

  it('la app del equipo sigue llamando a cesi_task_save y cesi_task_delete (parte 7) con sus datos', async () => {
    const calls = []
    const client = fakeClient(calls)
    await saveTeamTask(client, null, { title: ' T ', description: '', area: 'media', mode: 'people', assignees: ['u1'], assignArea: null, dueDate: '', priority: 'media', status: 'pendiente' })
    await deleteTeamTask(client, 't1')
    expect(calls.map((c) => c.name)).toEqual(['cesi_task_save', 'cesi_task_delete'])
    expect(calls[0].args).toMatchObject({ p_title: 'T', p_area: 'media', p_assignees: ['u1'] })
    expect(calls[1].args).toEqual({ p_id: 't1' })
  })

  it('las tareas del aula usan sus propias funciones (cesi_course_task_*)', async () => {
    const calls = []
    const client = fakeClient(calls)
    await saveTask(client, 'c1', { kind: 'tarea', title: 'T1', instructions: '', file: null, filePath: null, due: '2026-11-20T10:00', maxScore: '10' })
    await deleteTask(client, { id: 'x' })
    await listSubmissions(client, 'x')
    await gradeSubmission(client, 's1', { score: '8', feedback: '' })
    expect(calls.map((c) => c.name)).toEqual(['cesi_course_task_save', 'cesi_course_task_delete', 'cesi_course_task_submissions', 'cesi_course_task_grade'])
  })

  it('la definición de la parte 7 sigue siendo la del equipo', () => {
    const sql = read('parte7_tareas_fichaje.sql')
    expect(sql).toMatch(/create or replace function public\.cesi_task_delete\(p_id uuid\)\nreturns void/)
    expect(sql).toContain('delete from public.team_tasks')
  })
})

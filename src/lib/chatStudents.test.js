import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { canInvite } from './accessRules'

const sql = readFileSync(new URL('../../supabase/parte37_mensajes_alumnos.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const fn = (name) => {
  const start = sql.indexOf(`create or replace function public.${name}(`)
  return sql.slice(start, sql.indexOf('\n$$;', start))
}

describe('mensajes de los alumnos (parte 37)', () => {
  it('un alumno no entra en «Todo el equipo» ni en las de área: solo en sus privadas', () => {
    const can = fn('cesi_chat_can')
    expect(can).toContain("when 'team' then p.role in ('ceo', 'equipo')")
    expect(can).toContain("when 'area' then p.role = 'equipo' and (p.area = 'direccion' or p.area = c.area)")
    expect(can).toContain('else exists (select 1 from public.chat_members m where m.conversation_id = c.id and m.profile_id = p_me)')
  })

  it('a quién puede escribir: la regla de «quién invita a quién» y nunca a quien le ha bloqueado', () => {
    const write = fn('cesi_chat_can_write')
    expect(write).toContain('if public.cesi_chat_is_blocked(p_other, p_me) then')
    expect(write).toContain('return public.cesi_can_invite(p_me, p_other);')
    // La lista de personas y abrir una conversación nueva usan esa regla.
    expect(fn('cesi_chat_people')).toContain('and public.cesi_chat_can_write(v_me, p.id)')
    expect(fn('cesi_chat_open_private')).toContain('if v_id is null and not public.cesi_chat_can_write(v_me, p_other) then')
    // Con la misma regla de la app: el alumno escribe a sus profesores y compañeros, nunca a la ceo.
    const alumno = { id: 'al', role: 'alumno', studentCourses: ['office'] }
    expect(canInvite(alumno, { id: 'ceo', role: 'ceo' })).toBe(false)
    expect(canInvite(alumno, { id: 'p', role: 'equipo', teacherCourses: ['office'] })).toBe(true)
    expect(canInvite(alumno, { id: 'x', role: 'alumno', studentCourses: ['excel'] })).toBe(false)
  })

  it('no se puede enviar a quien te ha bloqueado', () => {
    expect(fn('cesi_chat_send')).toContain('public.cesi_chat_is_blocked(m.profile_id, v_me)')
  })

  it('reportar: solo mensajes de otros en conversaciones mías, y llega al Buzón de la ceo', () => {
    const report = fn('cesi_chat_report')
    expect(report).toContain('if v_msg.id is null or not public.cesi_chat_can(v_me, v_msg.conversation_id) then')
    expect(report).toContain('if v_msg.author_id = v_me then')
    expect(report).toContain("insert into public.mailbox (author_id, kind, body, reported)")
  })

  it('nadie toca los bloqueos directamente', () => {
    expect(sql).toContain('revoke all on public.chat_blocks from anon, authenticated;')
    expect(sql).toContain('revoke all on function public.cesi_chat_is_blocked(uuid, uuid) from public, anon, authenticated;')
  })
})

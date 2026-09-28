import { describe, expect, it } from 'vitest'
import { loadInvite, sendResponse, tokenFromPath, validateResponse } from './meetingResponse'

const TOKEN = 'a'.repeat(43)

function fakeFetch(status, body) {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) })
    return { ok: status < 400, status, json: async () => body }
  }
  return { calls, config: { url: 'https://x.supabase.co', anonKey: 'anon', fetchImpl } }
}

describe('página pública /confirmar/<token>', () => {
  it('lee el token de la dirección', () => {
    expect(tokenFromPath(`/confirmar/${TOKEN}`)).toBe(TOKEN)
    expect(tokenFromPath(`/confirmar/${TOKEN}/`)).toBe(TOKEN)
    expect(tokenFromPath('/confirmar/corto')).toBeNull()
    expect(tokenFromPath(`/ficha/${TOKEN}`)).toBeNull()
  })

  it('solo acepta Voy, No puedo o Quizás y un comentario de hasta 300 caracteres', () => {
    expect(validateResponse('yes', '')).toBeNull()
    expect(validateResponse('maybe', 'llegaré 10 minutos tarde')).toBeNull()
    expect(validateResponse(null, '')).toMatch(/Elige/)
    expect(validateResponse('si', '')).toMatch(/Elige/)
    expect(validateResponse('no', 'x'.repeat(300))).toBeNull()
    expect(validateResponse('no', 'x'.repeat(301))).toMatch(/300/)
  })

  it('llama a las funciones con la clave pública, sin tocar tablas', async () => {
    const { calls, config } = fakeFetch(200, { title: 'Revisión' })
    await loadInvite(TOKEN, config)
    expect(calls[0].url).toBe('https://x.supabase.co/rest/v1/rpc/cesi_meeting_invite_get')
    expect(calls[0].body).toEqual({ p_token: TOKEN })
  })

  it('envía la respuesta con el comentario sin espacios sobrantes', async () => {
    const { calls, config } = fakeFetch(200, { ok: true })
    await sendResponse(TOKEN, 'maybe', '  llegaré tarde  ', config)
    expect(calls[0].url).toMatch(/cesi_meeting_invite_respond$/)
    expect(calls[0].body).toEqual({ p_token: TOKEN, p_response: 'maybe', p_comment: 'llegaré tarde' })
  })

  it('explica los rechazos del servidor', async () => {
    const started = fakeFetch(400, { message: 'meeting_started' })
    await expect(sendResponse(TOKEN, 'yes', '', started.config)).rejects.toMatchObject({ code: 'meeting_started' })
    const revoked = fakeFetch(400, { message: 'invalid_link' })
    await expect(sendResponse(TOKEN, 'yes', '', revoked.config)).rejects.toMatchObject({ code: 'invalid_link' })
    const offline = { url: 'https://x', anonKey: 'k', fetchImpl: async () => { throw new Error('offline') } }
    await expect(sendResponse(TOKEN, 'yes', '', offline)).rejects.toMatchObject({ code: 'network' })
  })
})

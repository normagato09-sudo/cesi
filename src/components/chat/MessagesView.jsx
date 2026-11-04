import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Ban, Flag, Lock, MessageCircle, Pencil, Search, Send, Trash2, Users } from 'lucide-react'
import { hhmmOf } from '../../lib/sharedCalendar'
import {
  MAX_MESSAGE,
  dayHeading,
  deleteMessage,
  editMessage,
  groupByDay,
  linkify,
  listChatPeople,
  listConversations,
  listMessages,
  listTime,
  markRead,
  openPrivate,
  blockPerson,
  listBlocked,
  reportMessage,
  previewText,
  searchPeople,
  seenMessageId,
  sendMessage,
  subscribeChat,
} from '../../lib/chat'
import './Messages.css'

function Text({ text }) {
  return linkify(text).map((part, i) =>
    part.url ? (
      <a key={i} href={part.url} target="_blank" rel="noreferrer noopener">
        {part.text}
      </a>
    ) : (
      <span key={i}>{part.text}</span>
    ),
  )
}

// «Mensajes» en «Ver como»: no se lee nada (los mensajes son privados).
export function MessagesPrivate() {
  return (
    <div className="ms-root ms-private">
      <Lock size={28} strokeWidth={1.5} />
      <p className="ms-private-title">Los mensajes son privados</p>
      <p>En «Ver como» no se muestran los mensajes de otras personas.</p>
    </div>
  )
}

function Message({ m, zone, seen, onEdit, onDelete, onReport = null }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(m.body)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      await onEdit(m, text)
      setEditing(false)
    } catch (err) {
      window.alert(err.message)
    }
    setBusy(false)
  }
  return (
    <li className={`ms-msg${m.mine ? ' mine' : ''}${m.deleted ? ' deleted' : ''}`}>
      {!m.mine && <span className="ms-author">{m.author_name}</span>}
      {editing ? (
        <div className="ms-edit">
          <textarea value={text} maxLength={MAX_MESSAGE} onChange={(e) => setText(e.target.value)} rows={3} autoFocus aria-label="Editar el mensaje" />
          <div>
            <button type="button" className="ms-small" onClick={() => setEditing(false)} disabled={busy}>
              Cancelar
            </button>
            <button type="button" className="ms-small primary" onClick={save} disabled={busy || !text.trim()}>
              Guardar
            </button>
          </div>
        </div>
      ) : (
        <p className="ms-body">{m.deleted ? 'Mensaje eliminado' : <Text text={m.body} />}</p>
      )}
      <span className="ms-meta">
        {hhmmOf(new Date(m.created_at), zone)}
        {m.edited_at && !m.deleted && ' · Editado'}
        {seen && ' · Visto'}
        {onReport && !m.mine && !m.deleted && (
          <button type="button" className="ms-icon ms-report" aria-label="Reportar el mensaje" title="Reportar" onClick={() => onReport(m)}>
            <Flag size={12} strokeWidth={1.75} />
          </button>
        )}
        {m.mine && !m.deleted && !editing && (
          <>
            <button type="button" className="ms-icon" aria-label="Editar el mensaje" title="Editar" onClick={() => setEditing(true)}>
              <Pencil size={12} strokeWidth={1.75} />
            </button>
            <button type="button" className="ms-icon" aria-label="Borrar el mensaje" title="Borrar" onClick={() => window.confirm('¿Borrar este mensaje? Saldrá «Mensaje eliminado».') && onDelete(m)}>
              <Trash2 size={12} strokeWidth={1.75} />
            </button>
          </>
        )}
      </span>
    </li>
  )
}

/**
 * «Mensajes»: a la izquierda las conversaciones (última línea, hora y no leídos) y el buscador de
 * personas; a la derecha, la conversación. En el móvil, una cosa cada vez. En tiempo real.
 * meId: mi cuenta. zone: mi zona (las horas).
 */
// withPerson: id de una cuenta con la que abrir el chat privado al entrar (desde el Organigrama).
// safety (portal del alumno, parte 37): «Reportar» en los mensajes de los demás y «Bloquear» a la
// persona de una conversación privada.
export default function MessagesView({ client, meId, zone, withPerson = null, safety = false }) {
  const [blocked, setBlocked] = useState(() => new Set())
  const [blockTick, setBlockTick] = useState(0)
  useEffect(() => {
    if (!client || !safety) return
    let active = true
    listBlocked(client).then(
      (ids) => active && setBlocked(ids),
      () => {},
    )
    return () => {
      active = false
    }
  }, [client, safety, blockTick])
  const toggleBlock = async (otherId, name) => {
    const isBlocked = blocked.has(otherId)
    const question = isBlocked ? `¿Desbloquear a ${name}? Podrá volver a escribirte.` : `¿Bloquear a ${name}? Ya no te podrá escribir.`
    if (!window.confirm(question)) return
    try {
      await blockPerson(client, otherId, !isBlocked)
      setBlockTick((n) => n + 1)
    } catch (err) {
      window.alert(err.message)
    }
  }
  const report = async (m) => {
    const reason = window.prompt(`¿Por qué reportas este mensaje de ${m.author_name}? (opcional) Le llegará a la dirección con el mensaje.`, '')
    if (reason === null) return
    try {
      await reportMessage(client, m.id, reason)
      window.alert('Reportado. La dirección lo revisará.')
    } catch (err) {
      window.alert(err.message)
    }
  }
  const [conversations, setConversations] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [messages, setMessages] = useState(null)
  const [people, setPeople] = useState(null)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [listTick, setListTick] = useState(0)
  const [msgTick, setMsgTick] = useState(0)
  const endRef = useRef(null)
  const openRef = useRef(null)
  useEffect(() => {
    openRef.current = openId
  }, [openId])

  // La lista de conversaciones.
  useEffect(() => {
    if (!client) return
    let active = true
    listConversations(client).then(
      (rows) => {
        if (!active) return
        setConversations(rows || [])
        setError(null)
      },
      (err) => active && setError(err.message),
    )
    return () => {
      active = false
    }
  }, [client, listTick])

  // Los mensajes de la abierta (y se marca como leída).
  useEffect(() => {
    if (!client || !openId) return
    let active = true
    listMessages(client, openId).then(
      (rows) => {
        if (!active) return
        setMessages(rows || [])
        if (document.visibilityState !== 'hidden') markRead(client, openId).then(() => active && setListTick((n) => n + 1), () => {})
      },
      (err) => active && setError(err.message),
    )
    return () => {
      active = false
    }
  }, [client, openId, msgTick])

  // En tiempo real: un mensaje o un «leído» nuevo vuelve a leer la lista y, si es de la abierta, sus mensajes.
  useEffect(() => {
    if (!client) return
    return subscribeChat(client, ({ table, row }) => {
      setListTick((n) => n + 1)
      if (table === 'chat_messages' && row?.conversation_id && row.conversation_id === openRef.current) setMsgTick((n) => n + 1)
    })
  }, [client])

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' })
  }, [messages])

  const open = conversations?.find((c) => c.id === openId) || null
  const days = useMemo(() => groupByDay(messages || [], zone), [messages, zone])
  const seenId = useMemo(() => seenMessageId(messages || [], open), [messages, open])
  const matches = useMemo(() => (people && query.trim() ? searchPeople(people, query).slice(0, 8) : []), [people, query])

  const choose = useCallback((id) => {
    setMessages(null)
    setDraft('')
    setOpenId(id)
  }, [])

  // Al entrar con una persona elegida (Organigrama): su chat privado, abierto.
  useEffect(() => {
    if (!client || !withPerson) return
    let active = true
    openPrivate(client, withPerson).then(
      (id) => {
        if (!active) return
        setListTick((n) => n + 1)
        choose(id)
      },
      (err) => active && setError(err.message),
    )
    return () => {
      active = false
    }
  }, [client, withPerson, choose])

  const startWith = async (person) => {
    try {
      const id = await openPrivate(client, person.id)
      setQuery('')
      setListTick((n) => n + 1)
      choose(id)
    } catch (err) {
      window.alert(err.message)
    }
  }

  const send = async () => {
    const text = draft.trim()
    if (!text || !openId) return
    setSending(true)
    try {
      await sendMessage(client, openId, text)
      setDraft('')
      setMsgTick((n) => n + 1)
      setListTick((n) => n + 1)
    } catch (err) {
      window.alert(err.message)
    }
    setSending(false)
  }

  const onEdit = async (m, text) => {
    await editMessage(client, m.id, text)
    setMsgTick((n) => n + 1)
  }
  const onDelete = async (m) => {
    try {
      await deleteMessage(client, m.id)
      setMsgTick((n) => n + 1)
      setListTick((n) => n + 1)
    } catch (err) {
      window.alert(err.message)
    }
  }

  const icon = (c) => (c.kind === 'private' ? <MessageCircle size={16} strokeWidth={1.75} /> : <Users size={16} strokeWidth={1.75} />)

  return (
    <div className={`ms-root${openId ? ' has-open' : ''}`}>
      <aside className="ms-list" aria-label="Conversaciones">
        <div className="ms-list-head">
          <h1>Mensajes</h1>
          <label className="ms-search">
            <Search size={14} strokeWidth={1.75} />
            <input
              type="search"
              value={query}
              placeholder="Escribir a…"
              aria-label="Buscar una persona para escribirle"
              onFocus={() => people === null && listChatPeople(client).then(setPeople, () => setPeople([]))}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {matches.length > 0 && (
            <ul className="ms-people">
              {matches.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => startWith(p)}>
                    <strong>{p.name}</strong>
                    {p.area_name && <span>{p.area_name}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.trim() && people && matches.length === 0 && <p className="ms-muted">Nadie con ese nombre.</p>}
        </div>
        {error ? (
          <p className="ms-error">{error}</p>
        ) : !conversations ? (
          <p className="ms-muted">Cargando…</p>
        ) : (
          <ul className="ms-convs">
            {conversations.map((c) => (
              <li key={c.id}>
                <button type="button" className={`ms-conv${c.id === openId ? ' on' : ''}${c.unread ? ' unread' : ''}`} onClick={() => choose(c.id)}>
                  <span className="ms-conv-icon">{icon(c)}</span>
                  <span className="ms-conv-main">
                    <span className="ms-conv-top">
                      <strong>{c.title}</strong>
                      <span className="ms-conv-time">{listTime(c.last_at, zone)}</span>
                    </span>
                    <span className="ms-conv-bottom">
                      <span className="ms-conv-preview">{previewText(c, meId)}</span>
                      {c.unread > 0 && (
                        <span className="ms-badge" aria-label={`${c.unread} sin leer`}>
                          {c.unread}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="ms-thread" aria-label={open ? `Conversación: ${open.title}` : 'Conversación'}>
        {!open ? (
          <div className="ms-empty">
            <MessageCircle size={28} strokeWidth={1.5} />
            <p>Elige una conversación o busca a alguien para escribirle.</p>
          </div>
        ) : (
          <>
            <header className="ms-thread-head">
              <button type="button" className="ms-back" onClick={() => setOpenId(null)} aria-label="Volver a las conversaciones">
                <ArrowLeft size={18} strokeWidth={1.75} />
              </button>
              <h2>{open.title}</h2>
              <span className="ms-muted">{open.kind === 'private' ? 'Privada' : open.kind === 'area' ? 'Área' : 'Todo el equipo'}</span>
              {safety && open.kind === 'private' && open.other_id && (
                <button type="button" className="ms-small ms-block" onClick={() => toggleBlock(open.other_id, open.title)}>
                  <Ban size={13} strokeWidth={1.75} />
                  {blocked.has(open.other_id) ? 'Desbloquear' : 'Bloquear'}
                </button>
              )}
            </header>
            <div className="ms-messages">
              {!messages ? (
                <p className="ms-muted">Cargando…</p>
              ) : messages.length === 0 ? (
                <p className="ms-muted">Todavía no hay mensajes. Escribe el primero.</p>
              ) : (
                days.map((g) => (
                  <div key={g.day}>
                    <p className="ms-day">{dayHeading(g.day, zone)}</p>
                    <ul>
                      {g.messages.map((m) => (
                        <Message key={`${m.id}:${m.edited_at || ''}:${m.deleted}`} m={m} zone={zone} seen={m.id === seenId} onEdit={onEdit} onDelete={onDelete} onReport={safety ? report : null} />
                      ))}
                    </ul>
                  </div>
                ))
              )}
              <div ref={endRef} />
            </div>
            <form
              className="ms-compose"
              onSubmit={(e) => {
                e.preventDefault()
                send()
              }}
            >
              <textarea
                value={draft}
                rows={2}
                maxLength={MAX_MESSAGE}
                placeholder="Escribe un mensaje… (Intro para enviar; Mayús+Intro, nueva línea)"
                aria-label="Mensaje"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
              />
              <button type="submit" className="ms-send" disabled={sending || !draft.trim()} aria-label="Enviar">
                <Send size={16} strokeWidth={1.75} />
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  )
}

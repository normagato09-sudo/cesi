-- =============================================================================
-- CIFA · Parte 37: mensajes para alumnos (fase de alumnos)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 36
-- (supabase/parte36_calificaciones.sql). Se puede ejecutar más de una vez. No borra datos.
--
-- Reutiliza el chat del equipo (parte 21). Vuelve a escribir, con tu OK, cinco funciones suyas
-- AÑADIENDO solo los casos de los alumnos; para el equipo todo funciona igual que antes:
--   · cesi_chat_me: también las cuentas de alumno pueden usar Mensajes.
--   · cesi_chat_can: un alumno solo ve sus conversaciones privadas (nunca «Todo el equipo» ni las
--     de área).
--   · cesi_chat_people: a quién puede escribir cada uno. El equipo y la ceo, como antes, y además
--     los alumnos a los que pueden invitar (la ceo, a todos; el profesor, a los de sus cursos). El
--     alumno, a sus profesores y a sus compañeros de curso (la regla de «quién invita a quién»,
--     cesi_can_invite); a la ceo, nunca.
--   · cesi_chat_open_private: abrir una conversación con la misma regla, y nunca con quien te ha
--     bloqueado. (Si la ceo escribe a un alumno, él puede responderle en esa conversación.)
--   · cesi_chat_send: no se puede escribir a quien te ha bloqueado.
-- Y añade:
--   · chat_blocks y cesi_chat_block / cesi_chat_blocked: bloquear (y desbloquear) a una persona.
--   · cesi_chat_report: «Reportar» un mensaje: llega al Buzón de la ceo (parte 35) con el mensaje.

do $$
begin
  if to_regprocedure('public.cesi_grades_course(text)') is null then
    raise exception 'Falta la parte 36 (supabase/parte36_calificaciones.sql): ejecútala antes.';
  end if;
  if to_regclass('public.mailbox') is null or to_regprocedure('public.cesi_can_invite(uuid, uuid)') is null then
    raise exception 'Faltan las partes 22 y 35: ejecútalas antes.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Bloqueos
-- -----------------------------------------------------------------------------
create table if not exists public.chat_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.chat_blocks enable row level security;
revoke all on public.chat_blocks from anon, authenticated;

-- ¿Ha bloqueado `p_blocker` a `p_blocked`?
create or replace function public.cesi_chat_is_blocked(p_blocker uuid, p_blocked uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.chat_blocks where blocker_id = p_blocker and blocked_id = p_blocked);
$$;

revoke all on function public.cesi_chat_is_blocked(uuid, uuid) from public, anon, authenticated;

-- ¿Puede `p_me` empezar a escribir a `p_other`? (para la lista de personas y abrir una privada)
create or replace function public.cesi_chat_can_write(p_me uuid, p_other uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me_role text;
  v_other_role text;
begin
  if p_me is null or p_other is null or p_me = p_other then
    return false;
  end if;
  select role into v_me_role from public.profiles where id = p_me;
  select role into v_other_role from public.profiles where id = p_other;
  if v_other_role is null or v_other_role not in ('ceo', 'equipo', 'alumno') then
    return false;
  end if;
  if public.cesi_chat_is_blocked(p_other, p_me) then
    return false;
  end if;
  -- Entre el equipo y la ceo, como siempre.
  if v_me_role in ('ceo', 'equipo') and v_other_role in ('ceo', 'equipo') then
    return true;
  end if;
  -- Con alumnos: la regla de «quién invita a quién» (el alumno, nunca a la ceo).
  if v_me_role in ('ceo', 'equipo', 'alumno') then
    return public.cesi_can_invite(p_me, p_other);
  end if;
  return false;
end;
$$;

revoke all on function public.cesi_chat_can_write(uuid, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Las funciones del chat, con los alumnos
-- -----------------------------------------------------------------------------

-- La cuenta actual si puede usar Mensajes (la ceo, el equipo y, ahora, los alumnos).
create or replace function public.cesi_chat_me()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if not exists (select 1 from public.profiles where id = v_me and role in ('ceo', 'equipo', 'alumno')) then
    raise exception 'Los mensajes son solo para el equipo y los alumnos.' using errcode = '42501';
  end if;
  return v_me;
end;
$$;

-- ¿Puede `p_me` leer (y escribir en) esa conversación? Igual que en la parte 23 para la ceo y el
-- equipo; un alumno, solo sus conversaciones privadas.
create or replace function public.cesi_chat_can(p_me uuid, p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chat_conversations c
    join public.profiles p on p.id = p_me and p.role in ('ceo', 'equipo', 'alumno')
    where c.id = p_conversation
      and case c.kind
        when 'team' then p.role in ('ceo', 'equipo')
        -- De área: las personas de esa área y Directivo (la ceo, no).
        when 'area' then p.role = 'equipo' and (p.area = 'direccion' or p.area = c.area)
        else exists (select 1 from public.chat_members m where m.conversation_id = c.id and m.profile_id = p_me)
      end
  );
$$;

revoke all on function public.cesi_chat_can(uuid, uuid) from public, anon;
grant execute on function public.cesi_chat_can(uuid, uuid) to authenticated;

-- A quién puede escribir quien llama: area_name «Dirección», el nombre del área o «Alumno».
create or replace function public.cesi_chat_people()
returns table (id uuid, name text, area text, area_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := public.cesi_chat_me();
begin
  return query
    select p.id, public.cesi_person_name(p.id), p.area,
      case when p.role = 'ceo' then 'Dirección' when p.role = 'alumno' then 'Alumno' else coalesce(a.name, '') end
    from public.profiles p
    left join public.areas a on a.id = p.area
    where p.role in ('ceo', 'equipo', 'alumno') and p.id <> v_me
      and public.cesi_chat_can_write(v_me, p.id)
    order by 2;
end;
$$;

-- Abre (o devuelve) la conversación privada con otra persona a la que se puede escribir.
create or replace function public.cesi_chat_open_private(p_other uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_chat_me();
  v_key text;
  v_id uuid;
begin
  if p_other is null or p_other = v_me or not exists (select 1 from public.profiles where id = p_other and role in ('ceo', 'equipo', 'alumno')) then
    raise exception 'No puedes escribir a esa persona.' using errcode = '22023';
  end if;
  v_key := least(v_me::text, p_other::text) || ':' || greatest(v_me::text, p_other::text);
  select c.id into v_id from public.chat_conversations c where c.kind = 'private' and c.pair_key = v_key;
  -- Una que ya existe (p. ej. la ceo escribió a un alumno) se puede seguir usando; una nueva, solo
  -- si se le puede escribir.
  if v_id is null and not public.cesi_chat_can_write(v_me, p_other) then
    raise exception 'No puedes escribir a esa persona.' using errcode = '42501';
  end if;
  if v_id is not null and public.cesi_chat_is_blocked(p_other, v_me) then
    raise exception 'Esta persona te ha bloqueado.' using errcode = '42501';
  end if;
  if v_id is null then
    insert into public.chat_conversations (kind, pair_key) values ('private', v_key)
    on conflict do nothing
    returning id into v_id;
    if v_id is null then
      select c.id into v_id from public.chat_conversations c where c.kind = 'private' and c.pair_key = v_key;
    end if;
  end if;
  insert into public.chat_members (conversation_id, profile_id) values (v_id, v_me), (v_id, p_other)
  on conflict do nothing;
  return v_id;
end;
$$;

-- Envía un mensaje (como en la parte 21), salvo a quien te ha bloqueado.
create or replace function public.cesi_chat_send(p_conversation uuid, p_body text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_chat_me();
  v_body text := trim(coalesce(p_body, ''));
  v_id uuid;
begin
  if not public.cesi_chat_can(v_me, p_conversation) then
    raise exception 'No puedes escribir en esta conversación.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.chat_conversations c
    join public.chat_members m on m.conversation_id = c.id and m.profile_id <> v_me
    where c.id = p_conversation and c.kind = 'private' and public.cesi_chat_is_blocked(m.profile_id, v_me)
  ) then
    raise exception 'Esta persona te ha bloqueado.' using errcode = '42501';
  end if;
  if length(v_body) = 0 or length(v_body) > 4000 then
    raise exception 'Escribe el mensaje (como mucho 4000 caracteres).' using errcode = '22023';
  end if;
  insert into public.chat_messages (conversation_id, author_id, body) values (p_conversation, v_me, v_body)
  returning id into v_id;
  update public.chat_conversations set last_message_at = now() where id = p_conversation;
  insert into public.chat_reads (conversation_id, profile_id, last_read_at) values (p_conversation, v_me, now())
  on conflict (conversation_id, profile_id) do update set last_read_at = excluded.last_read_at;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Bloquear y reportar
-- -----------------------------------------------------------------------------

-- Bloquea (p_block true) o desbloquea a una persona: si está bloqueada, ya no te puede escribir.
create or replace function public.cesi_chat_block(p_other uuid, p_block boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_chat_me();
begin
  if p_other is null or p_other = v_me or not exists (select 1 from public.profiles where id = p_other) then
    raise exception 'Esa persona no existe.' using errcode = '22023';
  end if;
  if p_block then
    insert into public.chat_blocks (blocker_id, blocked_id) values (v_me, p_other) on conflict do nothing;
  else
    delete from public.chat_blocks where blocker_id = v_me and blocked_id = p_other;
  end if;
end;
$$;

-- A quién he bloqueado yo (ids).
create or replace function public.cesi_chat_blocked()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.blocked_id from public.chat_blocks b where b.blocker_id = public.cesi_chat_me();
$$;

-- «Reportar» un mensaje de otra persona en una conversación mía: llega al Buzón de la ceo con el
-- mensaje tal cual (texto, autor, fecha y conversación). Devuelve el id del aviso del buzón.
create or replace function public.cesi_chat_report(p_message uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_chat_me();
  v_msg public.chat_messages;
  v_reason text := left(trim(coalesce(p_reason, '')), 1000);
  v_id uuid;
begin
  select * into v_msg from public.chat_messages where id = p_message;
  if v_msg.id is null or not public.cesi_chat_can(v_me, v_msg.conversation_id) then
    raise exception 'No puedes reportar ese mensaje.' using errcode = '42501';
  end if;
  if v_msg.author_id = v_me then
    raise exception 'No puedes reportar tus propios mensajes.' using errcode = '22023';
  end if;
  insert into public.mailbox (author_id, kind, body, reported)
  values (
    v_me, 'reporte', coalesce(nullif(v_reason, ''), 'Mensaje reportado'),
    jsonb_build_object(
      'message_id', v_msg.id,
      'conversation_id', v_msg.conversation_id,
      'author_id', v_msg.author_id,
      'author_name', public.cesi_name_or_gone(v_msg.author_id, v_msg.author_gone_name),
      'body', case when v_msg.deleted_at is null then v_msg.body else '(mensaje eliminado)' end,
      'sent_at', v_msg.created_at
    )
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.cesi_chat_block(uuid, boolean) from public, anon;
revoke all on function public.cesi_chat_blocked() from public, anon;
revoke all on function public.cesi_chat_report(uuid, text) from public, anon;
grant execute on function public.cesi_chat_block(uuid, boolean) to authenticated;
grant execute on function public.cesi_chat_blocked() to authenticated;
grant execute on function public.cesi_chat_report(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: las conversaciones «Todo el equipo» y de área que vería un alumno (0), la tabla de
-- bloqueos (true) y las funciones nuevas con permiso (3).
select
  (select count(*) from public.chat_conversations c
     where c.kind in ('team', 'area')
       and exists (select 1 from public.profiles p where p.role = 'alumno' and public.cesi_chat_can(p.id, c.id))) as alumnos_en_chats_del_equipo,
  to_regclass('public.chat_blocks') is not null as bloqueos,
  (select count(*) from unnest(array[
     'public.cesi_chat_block(uuid, boolean)', 'public.cesi_chat_blocked()', 'public.cesi_chat_report(uuid, text)'
   ]) as f (sig) where has_function_privilege('authenticated', f.sig, 'execute')) as funciones_nuevas;

-- =============================================================================
-- CIFA · Parte 21: mensajes del equipo
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 20
-- (supabase/parte20_editar_segun_permisos.sql). Se puede ejecutar más de una vez. No borra datos
-- ni toca la sincronización de la ceo: son tablas nuevas.
--
-- Qué hace:
--   · chat_conversations: 'private' (dos personas), 'area' (una por área, automática) y 'team'
--     («Todo el equipo»). Las de área y la general se crean solas (también al crear un área).
--   · chat_members: las dos personas de cada conversación privada.
--   · chat_messages: los mensajes (texto, quién y cuándo, editado, borrado). Al borrar, el texto se
--     borra de verdad y queda «Mensaje eliminado».
--   · chat_reads: hasta cuándo ha leído cada persona cada conversación (no leídos y «visto»).
--   · Quién ve qué (también en tiempo real): la ceo y las personas de equipo, nunca los alumnos.
--     Privadas: solo sus dos participantes (la ceo tampoco). De área: las personas de esa área,
--     la ceo y Directivo. «Todo el equipo»: todos. Nadie escribe directamente en las tablas: solo
--     con las funciones de abajo. Ninguna acepta «Ver como» otra cuenta.
--   · Realtime: chat_messages y chat_reads van al canal en directo (respetando lo anterior).

do $$
begin
  if to_regprocedure('public.cesi_ceo_doc_patch(text, text, jsonb, jsonb, boolean)') is null then
    raise exception 'Falta la parte 20 (supabase/parte20_editar_segun_permisos.sql): ejecútala antes.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tablas
-- -----------------------------------------------------------------------------
--   pair_key  en las privadas, los dos ids ordenados ('a:b'), para no repetir la conversación
create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('private', 'area', 'team')),
  area text references public.areas (id) on update cascade on delete cascade,
  pair_key text,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  constraint chat_conversations_kind check (
    (kind = 'private' and pair_key is not null and area is null)
    or (kind = 'area' and area is not null and pair_key is null)
    or (kind = 'team' and area is null and pair_key is null)
  )
);
create unique index if not exists chat_conversations_area_idx on public.chat_conversations (area) where kind = 'area';
create unique index if not exists chat_conversations_pair_idx on public.chat_conversations (pair_key) where kind = 'private';
create unique index if not exists chat_conversations_team_idx on public.chat_conversations (kind) where kind = 'team';

create table if not exists public.chat_members (
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (conversation_id, profile_id)
);
create index if not exists chat_members_profile_idx on public.chat_members (profile_id);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  author_gone_name text not null default '',
  body text not null default '' check (length(body) <= 4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
create index if not exists chat_messages_conv_idx on public.chat_messages (conversation_id, created_at desc);

create table if not exists public.chat_reads (
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

-- Las de área y «Todo el equipo».
insert into public.chat_conversations (kind) select 'team'
where not exists (select 1 from public.chat_conversations where kind = 'team');
insert into public.chat_conversations (kind, area)
select 'area', a.id from public.areas a
where not exists (select 1 from public.chat_conversations c where c.kind = 'area' and c.area = a.id);

create or replace function public.cesi_chat_area_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.chat_conversations (kind, area) values ('area', new.id)
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function public.cesi_chat_area_created() from public, anon, authenticated;

drop trigger if exists areas_chat_created on public.areas;
create trigger areas_chat_created
  after insert on public.areas
  for each row execute function public.cesi_chat_area_created();

-- -----------------------------------------------------------------------------
-- Quién ve qué
-- -----------------------------------------------------------------------------
-- ¿Puede `p_me` leer (y escribir en) esa conversación?
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
    join public.profiles p on p.id = p_me and p.role in ('ceo', 'equipo')
    where c.id = p_conversation
      and case c.kind
        when 'team' then true
        when 'area' then p.role = 'ceo' or p.area = 'direccion' or p.area = c.area
        else exists (select 1 from public.chat_members m where m.conversation_id = c.id and m.profile_id = p_me)
      end
  );
$$;

-- La usan las reglas de acceso de abajo (con la cuenta que lee): tiene que poder ejecutarse.
revoke all on function public.cesi_chat_can(uuid, uuid) from public, anon;
grant execute on function public.cesi_chat_can(uuid, uuid) to authenticated;

alter table public.chat_conversations enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reads enable row level security;

drop policy if exists "chat_conversations: las mías" on public.chat_conversations;
create policy "chat_conversations: las mías" on public.chat_conversations
  for select to authenticated using (public.cesi_chat_can((select auth.uid()), id));

drop policy if exists "chat_members: de mis conversaciones" on public.chat_members;
create policy "chat_members: de mis conversaciones" on public.chat_members
  for select to authenticated using (public.cesi_chat_can((select auth.uid()), conversation_id));

drop policy if exists "chat_messages: de mis conversaciones" on public.chat_messages;
create policy "chat_messages: de mis conversaciones" on public.chat_messages
  for select to authenticated using (public.cesi_chat_can((select auth.uid()), conversation_id));

drop policy if exists "chat_reads: de mis conversaciones" on public.chat_reads;
create policy "chat_reads: de mis conversaciones" on public.chat_reads
  for select to authenticated using (public.cesi_chat_can((select auth.uid()), conversation_id));

revoke all on public.chat_conversations, public.chat_members, public.chat_messages, public.chat_reads from anon;
revoke all on public.chat_conversations, public.chat_members, public.chat_messages, public.chat_reads from authenticated;
grant select on public.chat_conversations, public.chat_members, public.chat_messages, public.chat_reads to authenticated;

-- Realtime: los mensajes y las lecturas llegan solos (cada uno, solo los que puede ver).
do $$
declare
  t text;
begin
  foreach t in array array['chat_messages', 'chat_reads'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Ayudas
-- -----------------------------------------------------------------------------

-- La cuenta actual, si es de equipo o la ceo (si no, error). Nunca otra («Ver como» no vale aquí).
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
  if not exists (select 1 from public.profiles where id = v_me and role in ('ceo', 'equipo')) then
    raise exception 'Los mensajes son solo para el equipo.' using errcode = '42501';
  end if;
  return v_me;
end;
$$;

-- Desde cuándo cuentan los no leídos de alguien que aún no ha abierto la conversación: desde que
-- entró en el equipo (para no tener todo el historial sin leer).
create or replace function public.cesi_chat_since(p_me uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select coalesce(role_set_at, created_at) from public.profiles where id = p_me), now());
$$;

revoke all on function public.cesi_chat_me() from public, anon, authenticated;
revoke all on function public.cesi_chat_since(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Leer
-- -----------------------------------------------------------------------------

-- Mis conversaciones, con la más reciente primero.
--   title        el área, «Todo el equipo» o la otra persona
--   other_id     en las privadas, la otra persona; other_read_at: hasta cuándo ha leído («visto»)
--   last_body    la última línea ('' si se borró: last_deleted), last_at, last_author_name
--   unread       mensajes de otros sin leer
create or replace function public.cesi_chat_list()
returns table (
  id uuid, kind text, area text, title text, other_id uuid, other_read_at timestamptz,
  last_body text, last_deleted boolean, last_at timestamptz, last_author_id uuid, last_author_name text,
  unread integer, my_read_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := public.cesi_chat_me();
  v_since timestamptz := public.cesi_chat_since(v_me);
begin
  return query
    select c.id, c.kind, c.area,
      case c.kind when 'team' then 'Todo el equipo' when 'area' then coalesce(a.name, c.area)
        else coalesce(public.cesi_name_or_gone(o.profile_id, null), 'Cuenta eliminada') end,
      o.profile_id,
      (select r.last_read_at from public.chat_reads r where r.conversation_id = c.id and r.profile_id = o.profile_id),
      case when lm.deleted_at is null then left(coalesce(lm.body, ''), 200) else '' end,
      lm.deleted_at is not null,
      lm.created_at, lm.author_id,
      case when lm.id is null then '' else public.cesi_name_or_gone(lm.author_id, lm.author_gone_name) end,
      (select count(*)::integer from public.chat_messages m
        where m.conversation_id = c.id and m.deleted_at is null and m.author_id is distinct from v_me
          and m.created_at > coalesce(mr.last_read_at, v_since)),
      mr.last_read_at
    from public.chat_conversations c
    left join public.areas a on a.id = c.area
    left join lateral (
      select m.profile_id from public.chat_members m where m.conversation_id = c.id and m.profile_id <> v_me limit 1
    ) o on c.kind = 'private'
    left join public.chat_reads mr on mr.conversation_id = c.id and mr.profile_id = v_me
    left join lateral (
      select m.id, m.body, m.created_at, m.author_id, m.author_gone_name, m.deleted_at
      from public.chat_messages m where m.conversation_id = c.id
      order by m.created_at desc limit 1
    ) lm on true
    where public.cesi_chat_can(v_me, c.id)
    order by coalesce(lm.created_at, c.created_at) desc, c.kind, a.sort nulls last;
end;
$$;

-- Mensajes de una conversación (los más recientes; p_before: los anteriores a esa hora), del más
-- antiguo al más nuevo. mine: los míos (se pueden editar y borrar).
create or replace function public.cesi_chat_messages(p_conversation uuid, p_before timestamptz default null, p_limit integer default 100)
returns table (
  id uuid, conversation_id uuid, author_id uuid, author_name text, body text,
  created_at timestamptz, edited_at timestamptz, deleted boolean, mine boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := public.cesi_chat_me();
begin
  if not public.cesi_chat_can(v_me, p_conversation) then
    raise exception 'No puedes ver esta conversación.' using errcode = '42501';
  end if;
  return query
    select x.id, x.conversation_id, x.author_id, x.author_name, x.body, x.created_at, x.edited_at, x.deleted, x.mine
    from (
      select m.id, m.conversation_id, m.author_id, public.cesi_name_or_gone(m.author_id, m.author_gone_name) as author_name,
        case when m.deleted_at is null then m.body else '' end as body,
        m.created_at, m.edited_at, m.deleted_at is not null as deleted, m.author_id = v_me as mine
      from public.chat_messages m
      where m.conversation_id = p_conversation and (p_before is null or m.created_at < p_before)
      order by m.created_at desc
      limit least(greatest(coalesce(p_limit, 100), 1), 300)
    ) x
    order by x.created_at;
end;
$$;

-- Personas con las que se puede abrir una privada: el equipo y la ceo (sin mí).
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
      case when p.role = 'ceo' then 'Dirección' else coalesce(a.name, '') end
    from public.profiles p
    left join public.areas a on a.id = p.area
    where p.role in ('ceo', 'equipo') and p.id <> v_me
    order by 2;
end;
$$;

-- Total de mensajes sin leer (para el menú y el Inicio).
create or replace function public.cesi_chat_unread()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(unread), 0)::integer from public.cesi_chat_list();
$$;

-- -----------------------------------------------------------------------------
-- Escribir
-- -----------------------------------------------------------------------------

-- Abrir (o crear) la conversación privada con otra persona del equipo o la ceo. Devuelve su id.
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
  if p_other is null or p_other = v_me or not exists (select 1 from public.profiles where id = p_other and role in ('ceo', 'equipo')) then
    raise exception 'Solo puedes escribir a otra persona del equipo.' using errcode = '22023';
  end if;
  v_key := least(v_me::text, p_other::text) || ':' || greatest(v_me::text, p_other::text);
  select c.id into v_id from public.chat_conversations c where c.kind = 'private' and c.pair_key = v_key;
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

-- Escribir un mensaje. Devuelve su id. También marca la conversación como leída.
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

-- Editar un mensaje mío (que no esté borrado).
create or replace function public.cesi_chat_edit(p_id uuid, p_body text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_chat_me();
  v_body text := trim(coalesce(p_body, ''));
begin
  if length(v_body) = 0 or length(v_body) > 4000 then
    raise exception 'Escribe el mensaje (como mucho 4000 caracteres).' using errcode = '22023';
  end if;
  update public.chat_messages set body = v_body, edited_at = now()
  where id = p_id and author_id = v_me and deleted_at is null
    and public.cesi_chat_can(v_me, conversation_id);
  if not found then
    raise exception 'Solo puedes editar tus mensajes.' using errcode = '42501';
  end if;
end;
$$;

-- Borrar un mensaje mío: se borra el texto y queda «Mensaje eliminado».
create or replace function public.cesi_chat_delete(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_chat_me();
begin
  update public.chat_messages set body = '', deleted_at = now()
  where id = p_id and author_id = v_me and deleted_at is null;
  if not found then
    raise exception 'Solo puedes borrar tus mensajes.' using errcode = '42501';
  end if;
end;
$$;

-- Marcar como leída una conversación (hasta ahora).
create or replace function public.cesi_chat_read(p_conversation uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_chat_me();
begin
  if not public.cesi_chat_can(v_me, p_conversation) then
    raise exception 'No puedes ver esta conversación.' using errcode = '42501';
  end if;
  insert into public.chat_reads (conversation_id, profile_id, last_read_at) values (p_conversation, v_me, now())
  on conflict (conversation_id, profile_id) do update set last_read_at = greatest(public.chat_reads.last_read_at, excluded.last_read_at);
end;
$$;

-- Al eliminar una cuenta, sus mensajes se quedan con su nombre.
create or replace function public.cesi_chat_gone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chat_messages
  set author_gone_name = left(coalesce(nullif(public.cesi_person_name(old.id), ''), 'Sin nombre'), 200)
  where author_id = old.id;
  return old;
end;
$$;

revoke all on function public.cesi_chat_gone() from public, anon, authenticated;

drop trigger if exists profiles_chat_gone on public.profiles;
create trigger profiles_chat_gone
  before delete on public.profiles
  for each row execute function public.cesi_chat_gone();

-- -----------------------------------------------------------------------------
-- Permisos de las funciones
-- -----------------------------------------------------------------------------
revoke all on function public.cesi_chat_list() from public, anon;
revoke all on function public.cesi_chat_messages(uuid, timestamptz, integer) from public, anon;
revoke all on function public.cesi_chat_people() from public, anon;
revoke all on function public.cesi_chat_unread() from public, anon;
revoke all on function public.cesi_chat_open_private(uuid) from public, anon;
revoke all on function public.cesi_chat_send(uuid, text) from public, anon;
revoke all on function public.cesi_chat_edit(uuid, text) from public, anon;
revoke all on function public.cesi_chat_delete(uuid) from public, anon;
revoke all on function public.cesi_chat_read(uuid) from public, anon;
grant execute on function public.cesi_chat_list() to authenticated;
grant execute on function public.cesi_chat_messages(uuid, timestamptz, integer) to authenticated;
grant execute on function public.cesi_chat_people() to authenticated;
grant execute on function public.cesi_chat_unread() to authenticated;
grant execute on function public.cesi_chat_open_private(uuid) to authenticated;
grant execute on function public.cesi_chat_send(uuid, text) to authenticated;
grant execute on function public.cesi_chat_edit(uuid, text) to authenticated;
grant execute on function public.cesi_chat_delete(uuid) to authenticated;
grant execute on function public.cesi_chat_read(uuid) to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: las 4 tablas, las conversaciones de área y la general, las 9 funciones con
-- permiso (9) y las 2 tablas en tiempo real (2).
select
  (select count(*) from unnest(array['chat_conversations', 'chat_members', 'chat_messages', 'chat_reads']) t
     where to_regclass('public.' || t) is not null) as tablas,
  (select count(*) from public.chat_conversations where kind in ('area', 'team')) as conversaciones_de_area_y_general,
  (select count(*) from unnest(array[
     'public.cesi_chat_list()', 'public.cesi_chat_messages(uuid, timestamptz, integer)', 'public.cesi_chat_people()',
     'public.cesi_chat_unread()', 'public.cesi_chat_open_private(uuid)', 'public.cesi_chat_send(uuid, text)',
     'public.cesi_chat_edit(uuid, text)', 'public.cesi_chat_delete(uuid)', 'public.cesi_chat_read(uuid)'
   ]) as f (sig) where has_function_privilege('authenticated', f.sig, 'execute')) as funciones_con_permiso,
  (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('chat_messages', 'chat_reads')) as en_tiempo_real;

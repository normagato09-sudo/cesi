-- =============================================================================
-- CIFA · Parte 35: Buzón de sugerencias y quejas (fase de alumnos)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 34
-- (supabase/parte34_newsletter.sql). Se puede ejecutar más de una vez. No borra ni cambia datos,
-- tablas ni funciones de antes: solo añade.
--
-- Qué hace:
--   · mailbox: lo que envían alumnos, profesores y equipo: «Sugerencia» o «Queja», texto (como
--     mucho 1000 caracteres) y, si quieren, uno de sus cursos. Estado: nueva / vista / resuelta, y
--     la respuesta de la ceo. (El tipo «reporte» lo usarán los mensajes de los alumnos, parte 37.)
--   · Solo la ceo los ve todos, cambia el estado y responde. Cada persona ve solo los suyos.
--   · Nadie toca la tabla directamente: cesi_mailbox_list, cesi_mailbox_send y cesi_mailbox_answer.

do $$
begin
  if to_regprocedure('public.cesi_newsletter_list()') is null then
    raise exception 'Falta la parte 34 (supabase/parte34_newsletter.sql): ejecútala antes.';
  end if;
  if to_regprocedure('public.cesi_testimonial_course_ids(uuid)') is null then
    raise exception 'Falta la parte 33 (supabase/parte33_testimonios.sql): ejecútala antes.';
  end if;
end;
$$;

create table if not exists public.mailbox (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('sugerencia', 'queja', 'reporte')),
  body text not null check (length(body) between 1 and 1000),
  -- '' = sin curso
  course_id text not null default '' check (length(course_id) <= 200),
  -- Para los reportes (parte 37): el mensaje reportado, tal cual.
  reported jsonb,
  status text not null default 'nueva' check (status in ('nueva', 'vista', 'resuelta')),
  reply text not null default '' check (length(reply) <= 2000),
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mailbox_author_idx on public.mailbox (author_id, created_at desc);
create index if not exists mailbox_created_idx on public.mailbox (created_at desc);

alter table public.mailbox enable row level security;
revoke all on public.mailbox from anon, authenticated;

-- La cuenta actual si puede usar el buzón (ceo, equipo o alumno); si no, error.
create or replace function public.cesi_mailbox_me()
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
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  return v_me;
end;
$$;

revoke all on function public.cesi_mailbox_me() from public, anon, authenticated;

-- La ceo, todos; el resto, solo los suyos. Del más nuevo al más antiguo.
create or replace function public.cesi_mailbox_list()
returns table (
  id uuid, kind text, body text, course_id text, course_name text, reported jsonb,
  status text, reply text, replied_at timestamptz, created_at timestamptz,
  author_name text, author_role text, mine boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := public.cesi_mailbox_me();
  v_ceo boolean := public.is_ceo();
begin
  return query
    select m.id, m.kind, m.body, m.course_id,
      case when m.course_id = '' then ''
        else coalesce((select nullif(trim(co.data ->> 'name'), '') from public.courses co
                       where co.id = m.course_id and co.deleted_at is null
                         and co.user_id in (select id from public.profiles where role = 'ceo') limit 1), 'Curso borrado') end,
      m.reported, m.status, m.reply, m.replied_at, m.created_at,
      public.cesi_person_name(p.id),
      case when p.role = 'alumno' then 'Alumno'
        when p.role = 'ceo' then 'CEO'
        when p.area = 'formacion' then 'Profesor'
        else coalesce((select a.name from public.areas a where a.id = p.area), 'Equipo') end,
      m.author_id = v_me
    from public.mailbox m
    join public.profiles p on p.id = m.author_id
    where v_ceo or m.author_id = v_me
    order by m.created_at desc;
end;
$$;

-- Envía una sugerencia o queja (cualquiera menos la ceo). p_course: uno de sus cursos o ''.
create or replace function public.cesi_mailbox_send(p_kind text, p_body text, p_course text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_mailbox_me();
  v_body text := trim(coalesce(p_body, ''));
  v_course text := coalesce(nullif(trim(p_course), ''), '');
  v_id uuid;
begin
  if public.is_ceo() then
    raise exception 'El buzón es para que te escriban a ti.' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('sugerencia', 'queja') then
    raise exception 'Elige «Sugerencia» o «Queja».' using errcode = '22023';
  end if;
  if length(v_body) = 0 or length(v_body) > 1000 then
    raise exception 'Escribe el texto (como mucho 1000 caracteres).' using errcode = '22023';
  end if;
  if v_course <> '' and v_course not in (select public.cesi_testimonial_course_ids(v_me)) then
    raise exception 'Solo puedes elegir tus cursos.' using errcode = '42501';
  end if;
  insert into public.mailbox (author_id, kind, body, course_id) values (v_me, p_kind, v_body, v_course)
  returning id into v_id;
  return v_id;
end;
$$;

-- La ceo cambia el estado y/o responde (p_reply null: no cambia la respuesta).
create or replace function public.cesi_mailbox_answer(p_id uuid, p_status text, p_reply text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reply text := trim(coalesce(p_reply, ''));
begin
  if not public.is_ceo() then
    raise exception 'Solo la dirección responde el buzón.' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('nueva', 'vista', 'resuelta') then
    raise exception 'Estado no válido.' using errcode = '22023';
  end if;
  if length(v_reply) > 2000 then
    raise exception 'La respuesta puede tener como mucho 2000 caracteres.' using errcode = '22023';
  end if;
  update public.mailbox m
  set status = coalesce(p_status, m.status),
    reply = case when p_reply is null then m.reply else v_reply end,
    replied_at = case when p_reply is null then m.replied_at when v_reply = '' then null else now() end,
    updated_at = now()
  where m.id = p_id;
  if not found then
    raise exception 'Ese mensaje ya no existe.' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.cesi_mailbox_list() from public, anon;
revoke all on function public.cesi_mailbox_send(text, text, text) from public, anon;
revoke all on function public.cesi_mailbox_answer(uuid, text, text) from public, anon;
grant execute on function public.cesi_mailbox_list() to authenticated;
grant execute on function public.cesi_mailbox_send(text, text, text) to authenticated;
grant execute on function public.cesi_mailbox_answer(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: la tabla (true), las 3 funciones con permiso (3) y la ayuda sin él (false).
select
  to_regclass('public.mailbox') is not null as tabla,
  (select count(*) from unnest(array[
     'public.cesi_mailbox_list()', 'public.cesi_mailbox_send(text, text, text)', 'public.cesi_mailbox_answer(uuid, text, text)'
   ]) as f (sig) where has_function_privilege('authenticated', f.sig, 'execute')) as funciones_con_permiso,
  has_function_privilege('authenticated', 'public.cesi_mailbox_me()', 'execute') as ayuda_interna;

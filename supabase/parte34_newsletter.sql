-- =============================================================================
-- CIFA · Parte 34: Newsletter (fase de alumnos)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 33
-- (supabase/parte33_testimonios.sql). Se puede ejecutar más de una vez. No borra ni cambia datos,
-- tablas ni funciones de antes: solo añade.
--
-- Qué hace:
--   · newsletter_posts: las publicaciones (título y texto con formato sencillo en marcas, nunca
--     HTML), en borrador o publicadas. Solo la ceo las escribe, publica, edita y borra.
--   · newsletter_reads: quién ha abierto cada una (para «Nueva» y el aviso del Inicio).
--   · Alumnos y equipo solo leen las publicadas. Nadie toca las tablas directamente; todo va con
--     estas funciones: cesi_newsletter_list, cesi_newsletter_save, cesi_newsletter_delete,
--     cesi_newsletter_read y cesi_newsletter_unread.

do $$
begin
  if to_regprocedure('public.cesi_testimonials()') is null then
    raise exception 'Falta la parte 33 (supabase/parte33_testimonios.sql): ejecútala antes.';
  end if;
end;
$$;

create table if not exists public.newsletter_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 200),
  body text not null default '' check (length(body) <= 20000),
  status text not null default 'draft' check (status in ('draft', 'published')),
  author_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists newsletter_posts_published_idx on public.newsletter_posts (published_at desc);

create table if not exists public.newsletter_reads (
  post_id uuid not null references public.newsletter_posts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);

alter table public.newsletter_posts enable row level security;
alter table public.newsletter_reads enable row level security;
revoke all on public.newsletter_posts, public.newsletter_reads from anon, authenticated;

-- La cuenta actual si puede leer la newsletter (ceo, equipo o alumno); si no, error.
create or replace function public.cesi_newsletter_me()
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

revoke all on function public.cesi_newsletter_me() from public, anon, authenticated;

-- Las publicaciones: la ceo, todas (también los borradores) con cuántos la han leído; el resto,
-- solo las publicadas, con si ya la ha abierto. La más nueva primero.
create or replace function public.cesi_newsletter_list()
returns table (
  id uuid, title text, body text, status text, created_at timestamptz, updated_at timestamptz,
  published_at timestamptz, is_read boolean, read_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := public.cesi_newsletter_me();
  v_ceo boolean := public.is_ceo();
begin
  return query
    select n.id, n.title, n.body, n.status, n.created_at, n.updated_at, n.published_at,
      exists (select 1 from public.newsletter_reads r where r.post_id = n.id and r.profile_id = v_me),
      case when v_ceo then (select count(*)::integer from public.newsletter_reads r where r.post_id = n.id) end
    from public.newsletter_posts n
    where v_ceo or n.status = 'published'
    order by coalesce(n.published_at, n.updated_at) desc;
end;
$$;

-- Guarda una publicación (la ceo): p_id null = nueva. p_publish: publicarla (si ya lo estaba,
-- sigue publicada con su fecha); si no, queda como borrador. Devuelve su id.
create or replace function public.cesi_newsletter_save(p_id uuid, p_title text, p_body text, p_publish boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_title text := trim(coalesce(p_title, ''));
  v_body text := coalesce(p_body, '');
  v_id uuid;
begin
  if not public.is_ceo() then
    raise exception 'Solo la dirección publica la newsletter.' using errcode = '42501';
  end if;
  if length(v_title) = 0 or length(v_title) > 200 then
    raise exception 'Escribe el título (como mucho 200 caracteres).' using errcode = '22023';
  end if;
  if length(v_body) > 20000 then
    raise exception 'El texto es demasiado largo.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.newsletter_posts (title, body, status, author_id, published_at)
    values (v_title, v_body, case when p_publish then 'published' else 'draft' end, v_me, case when p_publish then now() end)
    returning id into v_id;
  else
    update public.newsletter_posts n
    set title = v_title, body = v_body, updated_at = now(),
      status = case when p_publish or n.status = 'published' then 'published' else 'draft' end,
      published_at = case when p_publish or n.status = 'published' then coalesce(n.published_at, now()) end
    where n.id = p_id
    returning n.id into v_id;
    if v_id is null then
      raise exception 'Esa publicación ya no existe.' using errcode = '22023';
    end if;
  end if;
  return v_id;
end;
$$;

-- Borra una publicación (la ceo).
create or replace function public.cesi_newsletter_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_ceo() then
    raise exception 'Solo la dirección borra la newsletter.' using errcode = '42501';
  end if;
  delete from public.newsletter_posts where id = p_id;
end;
$$;

-- Marca como leída una publicación publicada (quien la abre).
create or replace function public.cesi_newsletter_read(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_newsletter_me();
begin
  if not exists (select 1 from public.newsletter_posts where id = p_id and status = 'published') then
    raise exception 'Esa publicación no está publicada.' using errcode = '22023';
  end if;
  insert into public.newsletter_reads (post_id, profile_id) values (p_id, v_me)
  on conflict do nothing;
end;
$$;

-- Para el aviso del Inicio: las publicadas sin abrir (cuántas y el título de la más nueva).
create or replace function public.cesi_newsletter_unread()
returns table (unread integer, latest_title text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := public.cesi_newsletter_me();
begin
  return query
    select count(*)::integer,
      (array_agg(n.title order by n.published_at desc))[1]
    from public.newsletter_posts n
    where n.status = 'published'
      and not exists (select 1 from public.newsletter_reads r where r.post_id = n.id and r.profile_id = v_me);
end;
$$;

revoke all on function public.cesi_newsletter_list() from public, anon;
revoke all on function public.cesi_newsletter_save(uuid, text, text, boolean) from public, anon;
revoke all on function public.cesi_newsletter_delete(uuid) from public, anon;
revoke all on function public.cesi_newsletter_read(uuid) from public, anon;
revoke all on function public.cesi_newsletter_unread() from public, anon;
grant execute on function public.cesi_newsletter_list() to authenticated;
grant execute on function public.cesi_newsletter_save(uuid, text, text, boolean) to authenticated;
grant execute on function public.cesi_newsletter_delete(uuid) to authenticated;
grant execute on function public.cesi_newsletter_read(uuid) to authenticated;
grant execute on function public.cesi_newsletter_unread() to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: las dos tablas (true), las 5 funciones con permiso (5) y la ayuda sin él (false).
select
  to_regclass('public.newsletter_posts') is not null and to_regclass('public.newsletter_reads') is not null as tablas,
  (select count(*) from unnest(array[
     'public.cesi_newsletter_list()', 'public.cesi_newsletter_save(uuid, text, text, boolean)',
     'public.cesi_newsletter_delete(uuid)', 'public.cesi_newsletter_read(uuid)', 'public.cesi_newsletter_unread()'
   ]) as f (sig) where has_function_privilege('authenticated', f.sig, 'execute')) as funciones_con_permiso,
  has_function_privilege('authenticated', 'public.cesi_newsletter_me()', 'execute') as ayuda_interna;

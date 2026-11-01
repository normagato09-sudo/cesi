-- =============================================================================
-- CIFA · Parte 18: avisos del equipo
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 17
-- (supabase/parte17_tableros_de_area.sql). Se puede ejecutar más de una vez. No borra datos ni
-- toca la sincronización de la ceo: son tablas nuevas del equipo.
--
-- Qué hace:
--   · team_notices: avisos (título, texto, para todo el equipo o un área, «Importante» y hasta
--     qué día se muestra). Publican la ceo y Directivo; editan y borran quien lo publicó y la ceo.
--   · team_notice_reads: quién ha leído cada aviso y cuándo («Leído»).
--   · Para quién: las personas de equipo (de esa área, si es para un área) que hay en cada
--     momento. Pasada su fecha, deja de mostrarse al equipo; quien publica lo sigue viendo
--     (caducado).
--   · Quien publica (la ceo y Directivo) ve en cada aviso cuántos lo han leído y quién falta.
--   · Nadie escribe directamente en las tablas: solo con las funciones de abajo.

do $$
begin
  if to_regprocedure('public.cesi_board_save(uuid, text, text, text, uuid, date, text, text, text, jsonb)') is null then
    raise exception 'Falta la parte 17 (supabase/parte17_tableros_de_area.sql): ejecútala antes.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tablas
-- -----------------------------------------------------------------------------
--   area        null: todo el equipo; si no, solo esa área (si se borra el área, se borra el aviso)
--   show_until  último día en que se muestra (null: siempre)
create table if not exists public.team_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 200),
  body text not null default '' check (length(body) <= 4000),
  area text references public.areas (id) on update cascade on delete cascade,
  important boolean not null default false,
  show_until date,
  created_by uuid references public.profiles (id) on delete set null,
  creator_gone_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists team_notices_created_idx on public.team_notices (created_at desc);

create table if not exists public.team_notice_reads (
  notice_id uuid not null references public.team_notices (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notice_id, profile_id)
);
create index if not exists team_notice_reads_profile_idx on public.team_notice_reads (profile_id);

-- -----------------------------------------------------------------------------
-- Ayudas
-- -----------------------------------------------------------------------------

-- ¿Publica avisos? (la ceo y Directivo)
create or replace function public.cesi_notice_publisher(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = p_profile and (role = 'ceo' or (role = 'equipo' and area = 'direccion'))
  );
$$;

-- ¿Es `p_profile` una de las personas a las que va el aviso? (de equipo y, si es para un área, de esa)
create or replace function public.cesi_notice_for(p_profile uuid, p_area text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = p_profile and role = 'equipo' and (p_area is null or area = p_area)
  );
$$;

-- Las usan las reglas de acceso de abajo (con la cuenta que lee): tienen que poder ejecutarse.
revoke all on function public.cesi_notice_publisher(uuid) from public, anon;
revoke all on function public.cesi_notice_for(uuid, text) from public, anon;
grant execute on function public.cesi_notice_publisher(uuid) to authenticated;
grant execute on function public.cesi_notice_for(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Reglas de acceso (solo leer; escribir, con las funciones)
-- -----------------------------------------------------------------------------
alter table public.team_notices enable row level security;
alter table public.team_notice_reads enable row level security;

drop policy if exists "team_notices: leer los míos (quien publica, todos)" on public.team_notices;
create policy "team_notices: leer los míos (quien publica, todos)" on public.team_notices
  for select to authenticated
  using (public.cesi_notice_publisher((select auth.uid())) or public.cesi_notice_for((select auth.uid()), area));

drop policy if exists "team_notice_reads: leer los míos (quien publica, todos)" on public.team_notice_reads;
create policy "team_notice_reads: leer los míos (quien publica, todos)" on public.team_notice_reads
  for select to authenticated
  using (profile_id = (select auth.uid()) or public.cesi_notice_publisher((select auth.uid())));

revoke all on public.team_notices, public.team_notice_reads from anon;
revoke all on public.team_notices, public.team_notice_reads from authenticated;
grant select on public.team_notices, public.team_notice_reads to authenticated;

-- -----------------------------------------------------------------------------
-- Leer
-- -----------------------------------------------------------------------------
-- Los avisos de la cuenta actual (o, solo la ceo, de otra con p_as: «Ver como»), del más nuevo al
-- más antiguo. A quien publica: todos (también los caducados) y, en cada uno, cuántos lo han leído
-- y quién falta. A los demás: los suyos que aún se muestran.
--   for_me      va para mí;  read_at: cuándo lo leí (null: sin leer)
--   expired     ya pasó su fecha (en mi zona)
--   can_edit    lo publiqué yo o soy la ceo
--   recipients / read_count / missing_names: solo para quien publica (si no, 0, 0 y '')
create or replace function public.cesi_notices(p_as uuid default null)
returns table (
  id uuid, title text, body text, area text, area_name text, important boolean, show_until date,
  created_by uuid, created_by_name text, created_at timestamptz, updated_at timestamptz,
  for_me boolean, read_at timestamptz, expired boolean, can_edit boolean,
  recipients integer, read_count integer, missing_names text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := (select auth.uid());
  v_publisher boolean;
  v_ceo boolean;
  v_today date;
begin
  if p_as is not null and p_as <> v_me then
    if not public.is_ceo() then
      raise exception 'Sin permiso.' using errcode = '42501';
    end if;
    v_me := p_as;
  end if;
  if coalesce((select p.role from public.profiles p where p.id = v_me), '') not in ('ceo', 'equipo') then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  v_publisher := public.cesi_notice_publisher(v_me);
  v_ceo := exists (select 1 from public.profiles p where p.id = v_me and p.role = 'ceo');
  v_today := (now() at time zone public.cesi_zone_of(v_me))::date;
  return query
    select n.id, n.title, n.body, n.area, coalesce(a.name, ''), n.important, n.show_until,
      n.created_by,
      case when n.created_by is null and n.creator_gone_name = '' then '' else public.cesi_name_or_gone(n.created_by, n.creator_gone_name) end,
      n.created_at, n.updated_at,
      public.cesi_notice_for(v_me, n.area),
      (select r.read_at from public.team_notice_reads r where r.notice_id = n.id and r.profile_id = v_me),
      n.show_until is not null and n.show_until < v_today,
      v_ceo or coalesce(n.created_by = v_me, false),
      case when v_publisher then coalesce(s.total, 0) else 0 end,
      case when v_publisher then coalesce(s.done, 0) else 0 end,
      case when v_publisher then coalesce(s.missing, '') else '' end
    from public.team_notices n
    left join public.areas a on a.id = n.area
    left join lateral (
      select count(*)::integer as total,
        (count(*) filter (where r.profile_id is not null))::integer as done,
        string_agg(x.name, ', ' order by x.name) filter (where r.profile_id is null) as missing
      from (
        select p.id, public.cesi_person_name(p.id) as name
        from public.profiles p
        where p.role = 'equipo' and (n.area is null or p.area = n.area)
      ) x
      left join public.team_notice_reads r on r.notice_id = n.id and r.profile_id = x.id
    ) s on v_publisher
    where v_publisher
       or (public.cesi_notice_for(v_me, n.area) and (n.show_until is null or n.show_until >= v_today))
    order by n.created_at desc;
end;
$$;

-- -----------------------------------------------------------------------------
-- Escribir
-- -----------------------------------------------------------------------------

-- Publicar (p_id null) o editar un aviso. Publican la ceo y Directivo; editan quien lo publicó y la
-- ceo. p_area: null (todo el equipo) o un área. Devuelve el id.
create or replace function public.cesi_notice_save(
  p_id uuid, p_title text, p_body text, p_area text, p_important boolean, p_show_until date
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_id uuid := p_id;
  v_old public.team_notices;
begin
  if not public.cesi_notice_publisher(v_me) then
    raise exception 'Solo la dirección y Directivo pueden publicar avisos.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_title, ''))) = 0 or length(trim(p_title)) > 200 then
    raise exception 'Escribe un título (como mucho 200 caracteres).' using errcode = '22023';
  end if;
  if length(coalesce(p_body, '')) > 4000 then
    raise exception 'El texto es demasiado largo (como mucho 4000 caracteres).' using errcode = '22023';
  end if;
  if p_area is not null and not exists (select 1 from public.areas where id = p_area) then
    raise exception 'Esa área no existe.' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.team_notices (title, body, area, important, show_until, created_by)
    values (trim(p_title), coalesce(p_body, ''), p_area, coalesce(p_important, false), p_show_until, v_me)
    returning id into v_id;
  else
    select * into v_old from public.team_notices where id = v_id for update;
    if not found or not (public.is_ceo() or coalesce(v_old.created_by = v_me, false)) then
      raise exception 'Solo quien lo publicó o la dirección pueden cambiarlo.' using errcode = '42501';
    end if;
    update public.team_notices
    set title = trim(p_title), body = coalesce(p_body, ''), area = p_area, important = coalesce(p_important, false),
        show_until = p_show_until, updated_at = now()
    where id = v_id;
  end if;
  return v_id;
end;
$$;

-- Borrar un aviso: quien lo publicó o la ceo.
create or replace function public.cesi_notice_delete(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  delete from public.team_notices
  where id = p_id and (public.is_ceo() or created_by = v_me);
  if not found then
    raise exception 'Solo quien lo publicó o la dirección pueden borrarlo.' using errcode = '42501';
  end if;
end;
$$;

-- «Leído» (p_read true) o volver a «sin leer» (false): la persona a la que va el aviso.
create or replace function public.cesi_notice_read(p_id uuid, p_read boolean default true)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_area text;
begin
  select area into v_area from public.team_notices where id = p_id;
  if not found then
    raise exception 'Ese aviso ya no existe.' using errcode = '22023';
  end if;
  if not public.cesi_notice_for(v_me, v_area) then
    raise exception 'Ese aviso no es para ti.' using errcode = '42501';
  end if;
  if coalesce(p_read, true) then
    insert into public.team_notice_reads (notice_id, profile_id) values (p_id, v_me)
    on conflict (notice_id, profile_id) do nothing;
  else
    delete from public.team_notice_reads where notice_id = p_id and profile_id = v_me;
  end if;
end;
$$;

-- Al eliminar una cuenta, sus avisos se quedan con su nombre.
create or replace function public.cesi_notices_gone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.team_notices
  set creator_gone_name = left(coalesce(nullif(public.cesi_person_name(old.id), ''), 'Sin nombre'), 200)
  where created_by = old.id;
  return old;
end;
$$;

revoke all on function public.cesi_notices_gone() from public, anon, authenticated;

drop trigger if exists profiles_notices_gone on public.profiles;
create trigger profiles_notices_gone
  before delete on public.profiles
  for each row execute function public.cesi_notices_gone();

-- -----------------------------------------------------------------------------
-- Permisos de las funciones
-- -----------------------------------------------------------------------------
revoke all on function public.cesi_notices(uuid) from public, anon;
revoke all on function public.cesi_notice_save(uuid, text, text, text, boolean, date) from public, anon;
revoke all on function public.cesi_notice_delete(uuid) from public, anon;
revoke all on function public.cesi_notice_read(uuid, boolean) from public, anon;
grant execute on function public.cesi_notices(uuid) to authenticated;
grant execute on function public.cesi_notice_save(uuid, text, text, text, boolean, date) to authenticated;
grant execute on function public.cesi_notice_delete(uuid) to authenticated;
grant execute on function public.cesi_notice_read(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: las tablas nuevas, las 4 funciones con permiso (4) y cuántos avisos hay.
select
  to_regclass('public.team_notices') is not null and to_regclass('public.team_notice_reads') is not null as tablas,
  (select count(*) from unnest(array[
     'public.cesi_notices(uuid)', 'public.cesi_notice_save(uuid, text, text, text, boolean, date)',
     'public.cesi_notice_delete(uuid)', 'public.cesi_notice_read(uuid, boolean)'
   ]) as f (sig) where has_function_privilege('authenticated', f.sig, 'execute')) as funciones_con_permiso,
  (select count(*) from public.team_notices) as avisos;

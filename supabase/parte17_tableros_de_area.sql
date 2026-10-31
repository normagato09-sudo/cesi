-- =============================================================================
-- CIFA · Parte 17: tablero de cada área (Moderación, Media, Técnico, Ciberseguridad y Legal)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 16
-- (supabase/parte16_alianzas.sql). Se puede ejecutar más de una vez. No borra datos ni toca la
-- sincronización de la ceo: son tablas nuevas del equipo.
--
-- Qué hace:
--   · board_configs: un tablero por área, con sus estados (en orden), los que cuentan como
--     terminados, la prioridad o gravedad (si tiene) y sus campos propios (con las opciones de
--     cada uno, o null si es texto libre). Para añadir el tablero de otra área: una fila aquí y
--     su bloque en src/lib/boards.js (nombres y textos).
--   · board_items: los elementos (título, descripción, responsable de esa área, fecha y hora si
--     el área la usa, prioridad o gravedad, estado y sus campos propios en fields).
--   · board_comments: comentarios con fecha y autor.
--   · Quién: las personas del área crean, editan, mueven y comentan; la ceo, todo; Directivo ve
--     todos los tableros y comenta; las demás áreas no ven nada. Nadie escribe directamente en
--     las tablas: solo con las funciones de abajo, que comprueban el permiso y los campos.
--   · Nunca se guardan contraseñas: el formulario de Ciberseguridad lo avisa (no se bloquea aquí).

do $$
begin
  if to_regprocedure('public.cesi_alliance_save(text, jsonb)') is null then
    raise exception 'Falta la parte 16 (supabase/parte16_alianzas.sql): ejecútala antes.';
  end if;
  if (select count(*) from public.areas where id in ('moderacion', 'media', 'tecnico', 'ciberseguridad', 'legal')) < 5 then
    raise exception 'Faltan áreas: ejecuta antes la parte 5 (supabase/parte5_areas.sql).';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Configuración de cada tablero
-- -----------------------------------------------------------------------------
--   statuses        estados en orden (las columnas)
--   done_statuses   los que cuentan como terminados (no salen como pendientes)
--   priorities      prioridad o gravedad (null: el tablero no la usa)
--   with_time       la fecha lleva hora (publicaciones)
--   fields          { campo: [opciones] | null (texto libre) }
create table if not exists public.board_configs (
  area text primary key references public.areas (id) on update cascade on delete cascade,
  statuses text[] not null,
  done_statuses text[] not null default '{}',
  priorities text[],
  with_time boolean not null default false,
  fields jsonb not null default '{}'::jsonb
);

insert into public.board_configs (area, statuses, done_statuses, priorities, with_time, fields) values
  ('moderacion', array['abierto', 'en_revision', 'resuelto'], array['resuelto'], array['leve', 'media', 'grave'], false,
    '{"type": ["aviso", "sancion", "incidencia", "expulsion"], "discordUser": null, "channel": null, "reason": null}'),
  ('media', array['idea', 'preparacion', 'programada', 'publicada'], array['publicada'], null, true,
    '{"network": ["instagram", "tiktok", "youtube", "x", "discord", "otra"], "link": null}'),
  ('tecnico', array['nueva', 'en_curso', 'en_pruebas', 'resuelta'], array['resuelta'], array['baja', 'media', 'alta', 'urgente'], false,
    '{"type": ["error", "peticion", "mejora"], "system": ["web", "app", "bot", "otro"], "requestedBy": null}'),
  ('ciberseguridad', array['abierto', 'en_analisis', 'resuelto'], array['resuelto'], array['leve', 'media', 'grave'], false,
    '{"type": ["incidente", "revision", "alerta"], "system": null}'),
  ('legal', array['borrador', 'en_vigor', 'a_revisar'], array['en_vigor'], null, false,
    '{"type": ["norma", "contrato", "privacidad", "otro"], "link": null}')
on conflict (area) do update set
  statuses = excluded.statuses, done_statuses = excluded.done_statuses, priorities = excluded.priorities,
  with_time = excluded.with_time, fields = excluded.fields;

-- -----------------------------------------------------------------------------
-- Elementos y comentarios
-- -----------------------------------------------------------------------------
create table if not exists public.board_items (
  id uuid primary key default gen_random_uuid(),
  area text not null references public.areas (id) on update cascade on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  description text not null default '' check (length(description) <= 4000),
  owner_id uuid references public.profiles (id) on delete set null,
  owner_gone_name text not null default '',
  due_date date,
  due_time time,
  priority text,
  status text not null,
  fields jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  creator_gone_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists board_items_area_idx on public.board_items (area, status);
create index if not exists board_items_owner_idx on public.board_items (owner_id);

create table if not exists public.board_comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.board_items (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  author_gone_name text not null default '',
  text text not null check (length(trim(text)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists board_comments_item_idx on public.board_comments (item_id, created_at);

-- -----------------------------------------------------------------------------
-- Ayudas
-- -----------------------------------------------------------------------------

-- Qué puede hacer `p_profile` en el tablero de `p_area`: 'edit' (las personas del área y la ceo),
-- 'comment' (Directivo: ver y comentar) o null (nada; tampoco si el área no tiene tablero).
create or replace function public.cesi_board_role(p_profile uuid, p_area text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (select 1 from public.board_configs where area = p_area) then null
    when p.role = 'ceo' then 'edit'
    when p.role = 'equipo' and p.area = p_area then 'edit'
    when p.role = 'equipo' and p.area = 'direccion' then 'comment'
  end
  from public.profiles p
  where p.id = p_profile;
$$;

-- Quién mira: la cuenta o, solo la ceo, otra con p_as («Ver como»).
create or replace function public.cesi_board_viewer(p_as uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if p_as is not null and p_as <> v_me then
    if not public.is_ceo() then
      raise exception 'Sin permiso.' using errcode = '42501';
    end if;
    return p_as;
  end if;
  return v_me;
end;
$$;

-- La usan las reglas de acceso de abajo (con la cuenta que lee): tiene que poder ejecutarla.
revoke all on function public.cesi_board_role(uuid, text) from public, anon;
grant execute on function public.cesi_board_role(uuid, text) to authenticated;
revoke all on function public.cesi_board_viewer(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Reglas de acceso (solo leer; escribir, con las funciones)
-- -----------------------------------------------------------------------------
alter table public.board_configs enable row level security;
alter table public.board_items enable row level security;
alter table public.board_comments enable row level security;

drop policy if exists "board_configs: leer" on public.board_configs;
create policy "board_configs: leer" on public.board_configs
  for select to authenticated using (true);

drop policy if exists "board_items: leer los de mis tableros" on public.board_items;
create policy "board_items: leer los de mis tableros" on public.board_items
  for select to authenticated
  using (public.cesi_board_role((select auth.uid()), area) is not null);

drop policy if exists "board_comments: leer los de mis tableros" on public.board_comments;
create policy "board_comments: leer los de mis tableros" on public.board_comments
  for select to authenticated
  using (exists (
    select 1 from public.board_items i
    where i.id = board_comments.item_id and public.cesi_board_role((select auth.uid()), i.area) is not null
  ));

revoke all on public.board_configs, public.board_items, public.board_comments from anon;
revoke all on public.board_configs, public.board_items, public.board_comments from authenticated;
grant select on public.board_configs, public.board_items, public.board_comments to authenticated;

-- -----------------------------------------------------------------------------
-- Leer
-- -----------------------------------------------------------------------------

-- Los elementos del tablero de un área (para quien lo ve), con el nombre del responsable,
-- cuántos comentarios tiene y lo que puedo hacer (can_edit: crear, editar, mover y borrar;
-- can_comment: comentar).
create or replace function public.cesi_board_items(p_area text, p_as uuid default null)
returns table (
  id uuid, area text, title text, description text, owner_id uuid, owner_name text,
  due_date date, due_time text, priority text, status text, fields jsonb,
  created_by_name text, created_at timestamptz, updated_at timestamptz, done_at timestamptz,
  comments_count integer, can_edit boolean, can_comment boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := public.cesi_board_viewer(p_as);
  v_role text := public.cesi_board_role(v_me, p_area);
begin
  if v_role is null then
    raise exception 'No tienes acceso a este tablero.' using errcode = '42501';
  end if;
  return query
    select i.id, i.area, i.title, i.description, i.owner_id,
      case when i.owner_id is null and i.owner_gone_name = '' then '' else public.cesi_name_or_gone(i.owner_id, i.owner_gone_name) end,
      i.due_date, to_char(i.due_time, 'HH24:MI'), i.priority, i.status, i.fields,
      case when i.created_by is null and i.creator_gone_name = '' then '' else public.cesi_name_or_gone(i.created_by, i.creator_gone_name) end,
      i.created_at, i.updated_at, i.done_at,
      (select count(*)::integer from public.board_comments c where c.item_id = i.id),
      v_role = 'edit', true
    from public.board_items i
    where i.area = p_area
    order by i.due_date nulls last, i.due_time nulls last, i.created_at;
end;
$$;

-- Comentarios de un elemento (del más antiguo al más nuevo). can_delete: los míos (la ceo, todos).
create or replace function public.cesi_board_comments(p_item uuid, p_as uuid default null)
returns table (id uuid, author_id uuid, author_name text, text text, created_at timestamptz, can_delete boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := public.cesi_board_viewer(p_as);
  v_area text := (select i.area from public.board_items i where i.id = p_item);
begin
  if v_area is null or public.cesi_board_role(v_me, v_area) is null then
    raise exception 'No tienes acceso a este tablero.' using errcode = '42501';
  end if;
  return query
    select c.id, c.author_id, public.cesi_name_or_gone(c.author_id, c.author_gone_name), c.text, c.created_at,
      p_as is null and (c.author_id = v_me or public.is_ceo())
    from public.board_comments c
    where c.item_id = p_item
    order by c.created_at;
end;
$$;

-- Responsables posibles de un tablero: las personas de equipo de esa área.
create or replace function public.cesi_board_people(p_area text)
returns table (id uuid, name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if public.cesi_board_role((select auth.uid()), p_area) is null then
    raise exception 'No tienes acceso a este tablero.' using errcode = '42501';
  end if;
  return query
    select p.id, public.cesi_person_name(p.id)
    from public.profiles p
    where p.role = 'equipo' and p.area = p_area
    order by 2;
end;
$$;

-- Elementos abiertos (sin terminar) por área, para «Mi equipo» y el Inicio de Directivo.
create or replace function public.cesi_board_counts(p_as uuid default null)
returns table (area text, open_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := public.cesi_home_viewer(p_as);
begin
  return query
    select b.area,
      (select count(*)::integer from public.board_items i where i.area = b.area and not (i.status = any (b.done_statuses)))
    from public.board_configs b
    join public.areas a on a.id = b.area
    order by a.sort;
end;
$$;

-- -----------------------------------------------------------------------------
-- Escribir
-- -----------------------------------------------------------------------------

-- Crear (p_id null) o editar un elemento (las personas del área y la ceo). p_fields: los campos
-- propios del área ({ campo: texto }); los que tienen opciones, solo esas (o vacío).
create or replace function public.cesi_board_save(
  p_id uuid, p_area text, p_title text, p_description text, p_owner uuid,
  p_due_date date, p_due_time text, p_priority text, p_status text, p_fields jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_cfg public.board_configs;
  v_old public.board_items;
  v_id uuid := p_id;
  v_fields jsonb := '{}'::jsonb;
  v_key text;
  v_value jsonb;
  v_time time;
begin
  select * into v_cfg from public.board_configs where area = p_area;
  if not found then
    raise exception 'Esa área no tiene tablero.' using errcode = '22023';
  end if;
  if public.cesi_board_role(v_me, p_area) is distinct from 'edit' then
    raise exception 'Solo las personas del área (y la dirección) pueden cambiar este tablero.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_title, ''))) = 0 or length(trim(p_title)) > 200 then
    raise exception 'Escribe un título (como mucho 200 caracteres).' using errcode = '22023';
  end if;
  if length(coalesce(p_description, '')) > 4000 then
    raise exception 'La descripción es demasiado larga.' using errcode = '22023';
  end if;
  if not (coalesce(p_status, '') = any (v_cfg.statuses)) then
    raise exception 'Estado no válido.' using errcode = '22023';
  end if;
  if p_priority is not null and (v_cfg.priorities is null or not (p_priority = any (v_cfg.priorities))) then
    raise exception 'Prioridad o gravedad no válida.' using errcode = '22023';
  end if;
  if p_owner is not null and not exists (select 1 from public.profiles where id = p_owner and role = 'equipo' and area = p_area) then
    raise exception 'El responsable tiene que ser una persona de esa área.' using errcode = '22023';
  end if;
  if coalesce(p_due_time, '') <> '' then
    if not v_cfg.with_time or p_due_date is null or p_due_time !~ '^([01]\d|2[0-3]):[0-5]\d$' then
      raise exception 'Hora no válida.' using errcode = '22023';
    end if;
    v_time := p_due_time::time;
  end if;

  -- Campos propios: solo los del área, en texto, y con sus opciones.
  if p_fields is not null and jsonb_typeof(p_fields) = 'object' then
    for v_key, v_value in select * from jsonb_each(p_fields) loop
      if not (v_cfg.fields ? v_key) then
        raise exception 'Campo no válido: %.', v_key using errcode = '22023';
      end if;
      if jsonb_typeof(v_value) = 'null' or (jsonb_typeof(v_value) = 'string' and v_value #>> '{}' = '') then
        continue;
      end if;
      if jsonb_typeof(v_value) <> 'string' or length(v_value #>> '{}') > 1000 then
        raise exception 'Campo no válido: %.', v_key using errcode = '22023';
      end if;
      if jsonb_typeof(v_cfg.fields -> v_key) = 'array' and not ((v_cfg.fields -> v_key) ? (v_value #>> '{}')) then
        raise exception 'Opción no válida en %.', v_key using errcode = '22023';
      end if;
      v_fields := v_fields || jsonb_build_object(v_key, trim(v_value #>> '{}'));
    end loop;
  end if;

  if v_id is null then
    insert into public.board_items (area, title, description, owner_id, due_date, due_time, priority, status, fields, created_by, done_at)
    values (p_area, trim(p_title), coalesce(p_description, ''), p_owner, p_due_date, v_time, p_priority, p_status, v_fields, v_me,
            case when p_status = any (v_cfg.done_statuses) then now() end)
    returning id into v_id;
  else
    select * into v_old from public.board_items where id = v_id for update;
    if not found or v_old.area <> p_area then
      raise exception 'Ese elemento ya no existe.' using errcode = '22023';
    end if;
    update public.board_items
    set title = trim(p_title), description = coalesce(p_description, ''), owner_id = p_owner,
        owner_gone_name = case when p_owner is null then owner_gone_name else '' end,
        due_date = p_due_date, due_time = v_time, priority = p_priority, status = p_status, fields = v_fields,
        updated_at = now(),
        done_at = case when not (p_status = any (v_cfg.done_statuses)) then null else coalesce(done_at, now()) end
    where id = v_id;
  end if;
  return v_id;
end;
$$;

-- Mover a otra columna (cambiar el estado).
create or replace function public.cesi_board_move(p_id uuid, p_status text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item public.board_items;
  v_cfg public.board_configs;
begin
  select * into v_item from public.board_items where id = p_id for update;
  if not found then
    raise exception 'Ese elemento ya no existe.' using errcode = '22023';
  end if;
  select * into v_cfg from public.board_configs where area = v_item.area;
  if public.cesi_board_role((select auth.uid()), v_item.area) is distinct from 'edit' then
    raise exception 'Solo las personas del área (y la dirección) pueden cambiar este tablero.' using errcode = '42501';
  end if;
  if not (coalesce(p_status, '') = any (v_cfg.statuses)) then
    raise exception 'Estado no válido.' using errcode = '22023';
  end if;
  update public.board_items
  set status = p_status, updated_at = now(),
      done_at = case when not (p_status = any (v_cfg.done_statuses)) then null else coalesce(done_at, now()) end
  where id = p_id;
end;
$$;

-- Borrar un elemento (las personas del área y la ceo), con sus comentarios.
create or replace function public.cesi_board_delete(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_area text := (select area from public.board_items where id = p_id);
begin
  if v_area is null then
    raise exception 'Ese elemento ya no existe.' using errcode = '22023';
  end if;
  if public.cesi_board_role((select auth.uid()), v_area) is distinct from 'edit' then
    raise exception 'Solo las personas del área (y la dirección) pueden borrar en este tablero.' using errcode = '42501';
  end if;
  delete from public.board_items where id = p_id;
end;
$$;

-- Comentar (las personas del área, Directivo y la ceo).
create or replace function public.cesi_board_comment_add(p_item uuid, p_text text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_area text := (select area from public.board_items where id = p_item);
  v_id uuid;
begin
  if v_area is null or public.cesi_board_role(v_me, v_area) is null then
    raise exception 'No tienes acceso a este tablero.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_text, ''))) = 0 or length(trim(p_text)) > 2000 then
    raise exception 'Escribe el comentario (como mucho 2000 caracteres).' using errcode = '22023';
  end if;
  insert into public.board_comments (item_id, author_id, text) values (p_item, v_me, trim(p_text)) returning id into v_id;
  return v_id;
end;
$$;

-- Borrar un comentario: quien lo escribió o la ceo.
create or replace function public.cesi_board_comment_delete(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  delete from public.board_comments where id = p_id and (author_id = v_me or public.is_ceo());
  if not found then
    raise exception 'Solo quien lo escribió o la dirección pueden borrarlo.' using errcode = '42501';
  end if;
end;
$$;

-- Al eliminar una cuenta, sus elementos y comentarios se quedan con su nombre.
create or replace function public.cesi_board_gone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left(coalesce(nullif(public.cesi_person_name(old.id), ''), 'Sin nombre'), 200);
begin
  update public.board_items set owner_gone_name = v_name where owner_id = old.id;
  update public.board_items set creator_gone_name = v_name where created_by = old.id;
  update public.board_comments set author_gone_name = v_name where author_id = old.id;
  return old;
end;
$$;

revoke all on function public.cesi_board_gone() from public, anon, authenticated;

drop trigger if exists profiles_board_gone on public.profiles;
create trigger profiles_board_gone
  before delete on public.profiles
  for each row execute function public.cesi_board_gone();

-- -----------------------------------------------------------------------------
-- Permisos de las funciones
-- -----------------------------------------------------------------------------
revoke all on function public.cesi_board_items(text, uuid) from public, anon;
revoke all on function public.cesi_board_comments(uuid, uuid) from public, anon;
revoke all on function public.cesi_board_people(text) from public, anon;
revoke all on function public.cesi_board_counts(uuid) from public, anon;
revoke all on function public.cesi_board_save(uuid, text, text, text, uuid, date, text, text, text, jsonb) from public, anon;
revoke all on function public.cesi_board_move(uuid, text) from public, anon;
revoke all on function public.cesi_board_delete(uuid) from public, anon;
revoke all on function public.cesi_board_comment_add(uuid, text) from public, anon;
revoke all on function public.cesi_board_comment_delete(uuid) from public, anon;
grant execute on function public.cesi_board_items(text, uuid) to authenticated;
grant execute on function public.cesi_board_comments(uuid, uuid) to authenticated;
grant execute on function public.cesi_board_people(text) to authenticated;
grant execute on function public.cesi_board_counts(uuid) to authenticated;
grant execute on function public.cesi_board_save(uuid, text, text, text, uuid, date, text, text, text, jsonb) to authenticated;
grant execute on function public.cesi_board_move(uuid, text) to authenticated;
grant execute on function public.cesi_board_delete(uuid) to authenticated;
grant execute on function public.cesi_board_comment_add(uuid, text) to authenticated;
grant execute on function public.cesi_board_comment_delete(uuid) to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: los 5 tableros, las tablas nuevas, las 9 funciones con permiso (9) y la
-- interna sin él (false).
select
  (select string_agg(area, ', ' order by area) from public.board_configs) as tableros,
  to_regclass('public.board_items') is not null and to_regclass('public.board_comments') is not null as tablas,
  (select count(*) from unnest(array[
     'public.cesi_board_items(text, uuid)', 'public.cesi_board_comments(uuid, uuid)', 'public.cesi_board_people(text)',
     'public.cesi_board_counts(uuid)', 'public.cesi_board_save(uuid, text, text, text, uuid, date, text, text, text, jsonb)',
     'public.cesi_board_move(uuid, text)', 'public.cesi_board_delete(uuid)', 'public.cesi_board_comment_add(uuid, text)',
     'public.cesi_board_comment_delete(uuid)'
   ]) as f (sig) where has_function_privilege('authenticated', f.sig, 'execute')) as funciones_con_permiso,
  has_function_privilege('authenticated', 'public.cesi_board_viewer(uuid)', 'execute') as interna;

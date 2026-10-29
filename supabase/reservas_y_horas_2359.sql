-- =============================================================================
-- CIFA · Enlace de reservas + límite de las 23:59 (sustituye a horas_2359_update.sql)
-- =============================================================================
-- Ejecutar una vez en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu).
-- horas_2359_update.sql fallaba porque en Supabase no existe booking_links (nunca se creó la
-- parte del enlace de reservas). Este archivo es lo mismo que hay en schema.sql para:
--   1. El enlace de reservas: tablas booking_links y booking_requests (create table if not exists,
--      add column if not exists), sus políticas y permisos, Realtime y sus funciones, ya con el
--      límite de las 23:59 en cesi_booking_request.
--   2. cesi_valid_week con el límite de las 23:59 (00:00 a 23:59, sin cruzar la medianoche).
-- No borra ni cambia datos y se puede ejecutar más de una vez: las tablas solo se crean si no
-- existen, las políticas se quitan y se vuelven a crear iguales y las funciones son create or
-- replace (solo se borra la versión antigua de cesi_booking_request, con un parámetro menos).

-- ---------------------------------------------------------------------------
-- 1. Enlace de reservas
-- ---------------------------------------------------------------------------
-- Quien tiene el enlace lo abre sin iniciar sesión, ve solo los huecos libres de mi horario desde
-- hoy hasta horizon_weeks semanas, y pide una reunión (nombre, email o teléfono y motivo).
-- La solicitud me llega como pendiente; hasta que la acepto o la rechazo, su hueco sale ocupado
-- para los demás. Al llegar su hora sin respuesta, caduca y el hueco se libera.
--
-- La página no toca las tablas: solo llama a cesi_booking_get y cesi_booking_request con el token.
-- Mis reuniones están en JSON (con repeticiones y excepciones), así que los huecos libres los
-- calcula la app y los publica en booking_links.published (solo intervalos de tiempo, sin títulos,
-- participantes ni nada más):
--   published = { free: [[inicio, fin], ...] (ISO, UTC),
--                 daysOff: [{ date: 'AAAA-MM-DD', kind: 'vacation' | 'holiday' }],
--                 horizonEnd: ISO (hasta dónde llega lo publicado), timeZone (la mía) }
--   (las versiones anteriores publicaban también weeks: ['AAAA-MM-DD'], las semanas declaradas)
-- La app publica 2 semanas más de las que se pueden reservar; las funciones recortan a hoy +
-- horizon_weeks (así la ventana avanza sola cada día) y restan las solicitudes pendientes (y
-- aceptadas) y la antelación mínima.
--   token          32 bytes aleatorios en base64url (lo genera la app)
--   display_name   «Reserva una reunión con <display_name>» (vacío: «Reserva una reunión»)
--   durations      duraciones que se pueden elegir, en minutos (30 y 60 por defecto)
--   min_notice_hours  antelación mínima (24 h por defecto)
--   step_minutes   cada cuánto empiezan los huecos (30 min por defecto)
--   horizon_weeks  "Se puede reservar hasta": semanas desde hoy (4 por defecto)
--   video_options  dónde se puede hacer la reunión (ver src/lib/videoCall.js)
--   revoked        true al regenerar o desactivar el enlace (como mucho uno activo por usuario)
create table if not exists public.booking_links (
  token text primary key check (length(token) between 32 and 100),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  display_name text not null default '' check (length(display_name) <= 80),
  durations int[] not null default '{30,60}'
    check (cardinality(durations) between 1 and 6 and durations <@ '{15,30,45,60,90,120}'::int[]),
  min_notice_hours int not null default 24 check (min_notice_hours between 0 and 720),
  step_minutes int not null default 30 check (step_minutes in (15, 30, 60)),
  horizon_weeks int not null default 4 check (horizon_weeks between 1 and 12),
  published jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

-- Para los enlaces creados antes de que existiera "Se puede reservar hasta".
alter table public.booking_links add column if not exists horizon_weeks int not null default 4
  check (horizon_weeks between 1 and 12);

-- Videollamada: dónde se puede hacer la reunión (zoom, meet, teams, jitsi, in_person). Mis salas
-- fijas no se guardan aquí (están en mis preferencias): solo qué opciones se ofrecen.
alter table public.booking_links add column if not exists video_options text[] not null default '{jitsi,in_person}'
  check (video_options <@ '{zoom,meet,teams,jitsi,in_person}'::text[]);

create unique index if not exists booking_links_active_idx on public.booking_links (user_id) where not revoked;

alter table public.booking_links enable row level security;
drop policy if exists "booking_links: leer los míos" on public.booking_links;
drop policy if exists "booking_links: crear los míos" on public.booking_links;
drop policy if exists "booking_links: editar los míos" on public.booking_links;
drop policy if exists "booking_links: borrar los míos" on public.booking_links;
create policy "booking_links: leer los míos" on public.booking_links
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "booking_links: crear los míos" on public.booking_links
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "booking_links: editar los míos" on public.booking_links
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "booking_links: borrar los míos" on public.booking_links
  for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.booking_links from anon;

-- Solicitudes de reunión. Solo las crea cesi_booking_request; la app solo las lee y cambia su
-- estado (aceptar o rechazar). status: 'pending' | 'accepted' | 'rejected'.
create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  link_token text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  name text not null check (length(name) between 1 and 120),
  email text not null default '' check (length(email) <= 200),
  phone text not null default '' check (length(phone) <= 40),
  reason text not null check (length(reason) between 1 and 500),
  time_zone text not null default '' check (length(time_zone) <= 64),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists booking_requests_user_idx on public.booking_requests (user_id, status, starts_at);

-- Dónde quiere hacer la reunión quien reserva ('' en las solicitudes anteriores).
alter table public.booking_requests add column if not exists meeting_place text not null default ''
  check (meeting_place in ('', 'zoom', 'meet', 'teams', 'jitsi', 'in_person'));

alter table public.booking_requests enable row level security;
drop policy if exists "booking_requests: leer los míos" on public.booking_requests;
drop policy if exists "booking_requests: editar los míos" on public.booking_requests;
drop policy if exists "booking_requests: borrar los míos" on public.booking_requests;
create policy "booking_requests: leer los míos" on public.booking_requests
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "booking_requests: editar los míos" on public.booking_requests
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "booking_requests: borrar los míos" on public.booking_requests
  for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.booking_requests from anon;
revoke insert, update on public.booking_requests from authenticated;
grant select, delete on public.booking_requests to authenticated;
grant update (status, decided_at) on public.booking_requests to authenticated;

-- Realtime: las solicitudes nuevas llegan solas a la app (respetando RLS).
do $$
begin
  alter publication supabase_realtime add table public.booking_requests;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

-- Mi zona horaria (la publicada) o UTC si no es válida. Interna.
create or replace function public.cesi_booking_zone(p_link public.booking_links)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_zone text := p_link.published ->> 'timeZone';
begin
  if v_zone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = v_zone) then
    return 'UTC';
  end if;
  return v_zone;
end;
$$;

-- Último día que se puede reservar, en mi zona horaria: hoy + horizon_weeks semanas - 1 día
-- (4 semanas un jueves 8: hasta el miércoles 4 del mes siguiente). Interna.
create or replace function public.cesi_booking_until(p_link public.booking_links)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone public.cesi_booking_zone(p_link))::date + 7 * p_link.horizon_weeks - 1;
$$;

-- Huecos libres de un enlace: lo publicado por la app, desde ahora + la antelación mínima hasta el
-- fin del último día que se puede reservar (sin pasar de lo publicado), menos las solicitudes
-- pendientes que aún no han empezado y las aceptadas que aún no han terminado. Interna (no la
-- puede llamar nadie desde fuera).
create or replace function public.cesi_booking_free(p_link public.booking_links)
returns tstzmultirange
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_free tstzmultirange;
  v_busy tstzmultirange;
  v_from timestamptz := now() + make_interval(hours => p_link.min_notice_hours);
  v_to timestamptz;
begin
  begin
    v_to := ((public.cesi_booking_until(p_link) + 1)::timestamp at time zone public.cesi_booking_zone(p_link));
    v_to := least(v_to, (p_link.published ->> 'horizonEnd')::timestamptz);
    select range_agg(tstzrange((e ->> 0)::timestamptz, (e ->> 1)::timestamptz))
      into v_free
    from jsonb_array_elements(
      case when jsonb_typeof(p_link.published -> 'free') = 'array' then p_link.published -> 'free' else '[]'::jsonb end
    ) e
    where jsonb_typeof(e) = 'array' and (e ->> 0)::timestamptz < (e ->> 1)::timestamptz;
  exception when others then
    return '{}'::tstzmultirange;
  end;
  if v_free is null or v_to is null or v_to <= v_from then
    return '{}'::tstzmultirange;
  end if;
  select range_agg(tstzrange(r.starts_at, r.ends_at))
    into v_busy
  from public.booking_requests r
  where r.user_id = p_link.user_id
    and ((r.status = 'pending' and r.starts_at > now()) or (r.status = 'accepted' and r.ends_at > now()));
  return v_free * tstzmultirange(tstzrange(v_from, v_to)) - coalesce(v_busy, '{}'::tstzmultirange);
end;
$$;

-- Lo que ve la página: nombre, duraciones, opciones de dónde hacer la reunión (videoOptions), huecos libres, último día que se puede reservar
-- (until), días de vacaciones o festivo (solo la fecha y el tipo) y, por compatibilidad, las
-- semanas que publicaban las versiones anteriores. null si el enlace no existe o está desactivado.
create or replace function public.cesi_booking_get(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_link public.booking_links%rowtype;
  v_free jsonb;
  v_weeks jsonb;
  v_days jsonb;
  v_zone text;
begin
  if p_token is null or length(p_token) > 100 then
    return null;
  end if;
  select * into v_link from public.booking_links where token = p_token and not revoked;
  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_array(lower(r), upper(r)) order by lower(r)), '[]'::jsonb)
    into v_free
  from unnest(public.cesi_booking_free(v_link)) r;

  select coalesce(jsonb_agg(w order by w), '[]'::jsonb)
    into v_weeks
  from (
    select distinct w #>> '{}' as w
    from jsonb_array_elements(
      case when jsonb_typeof(v_link.published -> 'weeks') = 'array' then v_link.published -> 'weeks' else '[]'::jsonb end
    ) w
    where jsonb_typeof(w) = 'string' and (w #>> '{}') ~ '^\d{4}-\d{2}-\d{2}$'
  ) s;

  select coalesce(jsonb_agg(jsonb_build_object('date', d ->> 'date', 'kind', d ->> 'kind') order by d ->> 'date'), '[]'::jsonb)
    into v_days
  from jsonb_array_elements(
    case when jsonb_typeof(v_link.published -> 'daysOff') = 'array' then v_link.published -> 'daysOff' else '[]'::jsonb end
  ) d
  where jsonb_typeof(d) = 'object'
    and (d ->> 'date') ~ '^\d{4}-\d{2}-\d{2}$'
    and (d ->> 'kind') in ('vacation', 'holiday');

  v_zone := v_link.published ->> 'timeZone';
  if v_zone is null or v_zone !~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$' then
    v_zone := '';
  end if;

  return jsonb_build_object(
    'name', v_link.display_name,
    'durations', to_jsonb(v_link.durations),
    'stepMinutes', v_link.step_minutes,
    'minNoticeHours', v_link.min_notice_hours,
    'free', v_free,
    'weeks', v_weeks,
    'until', public.cesi_booking_until(v_link),
    'daysOff', v_days,
    'timeZone', v_zone,
    'videoOptions', to_jsonb(v_link.video_options)
  );
end;
$$;

-- Pide una reunión. Lo vuelve a comprobar todo: enlace activo, duración permitida, inicio en
-- punto (cada step_minutes), antelación mínima, hueco libre (también frente a otras solicitudes,
-- con un bloqueo para que dos personas no reserven el mismo hueco a la vez), que no cruce la
-- medianoche en mi zona (acaba como muy tarde a las 23:59 del día en que empieza), datos y límites
-- antispam (5 pendientes por email o teléfono y 20 en total). Errores (en el mensaje):
-- invalid_link, invalid_slot, slot_taken, name_required, contact_required, invalid_email,
-- invalid_phone, reason_required, too_many, invalid_place (una opción de dónde hacer la reunión que el
-- enlace no ofrece; '' vale: páginas anteriores que no preguntaban).
-- La versión anterior (sin p_place) se quita: con dos versiones, las llamadas serían ambiguas.
drop function if exists public.cesi_booking_request(text, timestamptz, int, text, text, text, text, text);
create or replace function public.cesi_booking_request(
  p_token text,
  p_start timestamptz,
  p_minutes int,
  p_name text,
  p_email text,
  p_phone text,
  p_reason text,
  p_time_zone text,
  p_place text default ''
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_link public.booking_links%rowtype;
  v_end timestamptz;
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_phone text := btrim(regexp_replace(coalesce(p_phone, ''), '\s+', ' ', 'g'));
  v_digits text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_zone text := btrim(coalesce(p_time_zone, ''));
  v_place text := btrim(coalesce(p_place, ''));
  v_owner_zone text;
  v_id uuid;
begin
  if p_token is null or length(p_token) > 100 then
    raise exception 'invalid_link';
  end if;
  select * into v_link from public.booking_links where token = p_token and not revoked;
  if not found then
    raise exception 'invalid_link';
  end if;

  if v_name = '' then
    raise exception 'name_required';
  end if;
  if length(v_name) > 120 then
    raise exception 'invalid_data';
  end if;
  if v_email = '' and v_phone = '' then
    raise exception 'contact_required';
  end if;
  if v_email <> '' and (length(v_email) > 200 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'invalid_email';
  end if;
  v_digits := regexp_replace(v_phone, '\D', '', 'g');
  if v_phone <> '' and (length(v_phone) > 40 or v_phone !~ '^\+?[0-9 ()./-]+$' or length(v_digits) < 6) then
    raise exception 'invalid_phone';
  end if;
  if v_reason = '' then
    raise exception 'reason_required';
  end if;
  if length(v_reason) > 500 then
    raise exception 'invalid_data';
  end if;
  if length(v_zone) > 64 then
    v_zone := '';
  end if;
  if v_place <> '' and not (v_place = any (v_link.video_options)) then
    raise exception 'invalid_place';
  end if;

  if p_start is null or p_minutes is null or not (p_minutes = any (v_link.durations))
    or mod(extract(epoch from p_start)::bigint, v_link.step_minutes * 60) <> 0 then
    raise exception 'invalid_slot';
  end if;
  v_end := p_start + make_interval(mins => p_minutes);
  -- Una reunión que acaba a las 00:00 o más tarde ya es del día siguiente en mi zona.
  v_owner_zone := public.cesi_booking_zone(v_link);
  if (p_start at time zone v_owner_zone)::date <> (v_end at time zone v_owner_zone)::date then
    raise exception 'invalid_slot';
  end if;

  -- Una reserva a la vez por usuario: así dos personas no pueden coger el mismo hueco.
  perform pg_advisory_xact_lock(hashtextextended('cesi_booking:' || v_link.user_id::text, 0));

  if not (tstzrange(p_start, v_end) <@ public.cesi_booking_free(v_link)) then
    raise exception 'slot_taken';
  end if;

  if (select count(*) from public.booking_requests r
      where r.user_id = v_link.user_id and r.status = 'pending' and r.starts_at > now()) >= 20 then
    raise exception 'too_many';
  end if;
  if (select count(*) from public.booking_requests r
      where r.user_id = v_link.user_id and r.status = 'pending' and r.starts_at > now()
        and ((v_email <> '' and r.email = v_email)
          or (v_digits <> '' and regexp_replace(r.phone, '\D', '', 'g') = v_digits))) >= 5 then
    raise exception 'too_many';
  end if;

  insert into public.booking_requests (user_id, link_token, starts_at, ends_at, name, email, phone, reason, time_zone, meeting_place)
  values (v_link.user_id, v_link.token, p_start, v_end, v_name, v_email, v_phone, v_reason, v_zone, v_place)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'start', p_start, 'end', v_end);
end;
$$;

-- Solo la página pública (anon) y la app pueden llamar a estas dos; las demás son internas.
revoke all on function public.cesi_booking_zone(public.booking_links) from public, anon, authenticated;
revoke all on function public.cesi_booking_until(public.booking_links) from public, anon, authenticated;
revoke all on function public.cesi_booking_free(public.booking_links) from public, anon, authenticated;
revoke all on function public.cesi_booking_get(text) from public;
revoke all on function public.cesi_booking_request(text, timestamptz, int, text, text, text, text, text, text) from public;
grant execute on function public.cesi_booking_get(text) to anon, authenticated;
grant execute on function public.cesi_booking_request(text, timestamptz, int, text, text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Horario semanal válido (límite de las 23:59)
-- ---------------------------------------------------------------------------
-- ¿Es un horario semanal válido (o null)? [{ day: 0..6, enabled, slots: [{ start: 'HH:mm', end }] }]
-- Horas de 00:00 a 23:59 (no vale 24:00) y, en los días activos, cada franja termina después de
-- empezar: ninguna cruza la medianoche.
create or replace function public.cesi_valid_week(p_week jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  e jsonb;
  s jsonb;
  seen int[] := '{}';
  hhmm constant text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
begin
  if p_week is null or jsonb_typeof(p_week) = 'null' then
    return true;
  end if;
  if jsonb_typeof(p_week) <> 'array' or jsonb_array_length(p_week) <> 7 then
    return false;
  end if;
  for e in select value from jsonb_array_elements(p_week) loop
    if jsonb_typeof(e) <> 'object' then
      return false;
    end if;
    if exists (select 1 from jsonb_object_keys(e) k where k not in ('day', 'enabled', 'slots')) then
      return false;
    end if;
    if jsonb_typeof(e -> 'day') is distinct from 'number'
      or jsonb_typeof(e -> 'enabled') is distinct from 'boolean'
      or jsonb_typeof(e -> 'slots') is distinct from 'array' then
      return false;
    end if;
    if (e ->> 'day') !~ '^[0-6]$' or (e ->> 'day')::int = any (seen) then
      return false;
    end if;
    seen := seen || (e ->> 'day')::int;
    if jsonb_array_length(e -> 'slots') > 8 then
      return false;
    end if;
    for s in select value from jsonb_array_elements(e -> 'slots') loop
      if jsonb_typeof(s) <> 'object' then
        return false;
      end if;
      if exists (select 1 from jsonb_object_keys(s) k where k not in ('start', 'end')) then
        return false;
      end if;
      if jsonb_typeof(s -> 'start') is distinct from 'string' or jsonb_typeof(s -> 'end') is distinct from 'string'
        or (s ->> 'start') !~ hhmm or (s ->> 'end') !~ hhmm then
        return false;
      end if;
      if (e ->> 'enabled')::boolean and (s ->> 'end')::time <= (s ->> 'start')::time then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end;
$$;


revoke all on function public.cesi_valid_week(jsonb) from public, anon, authenticated;

-- Que la API vea las tablas y funciones nuevas enseguida.
notify pgrst, 'reload schema';

-- =============================================================================
-- CIFA · Límite de las 23:59 en Supabase (commit e0acfa2)
-- =============================================================================
-- Ejecutar una vez en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu).
-- Actualiza dos funciones a la versión de schema.sql:
--   · cesi_valid_week: las horas van de 00:00 a 23:59 (ya no vale 24:00) y ninguna franja cruza
--     la medianoche (la ficha que rellena un contacto con su enlace).
--   · cesi_booking_request: una reserva no puede cruzar la medianoche en tu zona (acaba como
--     muy tarde a las 23:59 del día en que empieza).
-- Solo cambia funciones: no crea, borra ni cambia datos. Se puede ejecutar más de una vez.
-- (Las tablas, columnas y demás funciones de schema.sql ya están en Supabase.)

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

revoke all on function public.cesi_booking_request(text, timestamptz, int, text, text, text, text, text, text) from public;
grant execute on function public.cesi_booking_request(text, timestamptz, int, text, text, text, text, text, text) to anon, authenticated;

-- Que la API vea las funciones actualizadas enseguida.
notify pgrst, 'reload schema';

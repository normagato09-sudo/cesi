-- =============================================================================
-- CIFA · Parte 19: Finanzas
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 18
-- (supabase/parte18_avisos_del_equipo.sql). Se puede ejecutar más de una vez. No borra datos ni
-- toca la sincronización de la ceo: son tablas nuevas del equipo.
--
-- Qué hace:
--   · finance_movements: ingresos y gastos (fecha, concepto, cantidad en céntimos, categoría,
--     área relacionada, método, enlace al justificante, notas y, en un ingreso de Alianzas, el
--     contacto externo: su id y una copia de su nombre, nada más).
--   · finance_budgets: cuánto puede gastar cada área al mes.
--   · finance_log: cada cambio (alta, edición o borrado de un movimiento y cambio de presupuesto),
--     con quién y cuándo, y los datos de antes y de después.
--   · Quién: Finanzas y la ceo crean, editan y borran; Directivo solo ve; las demás áreas, nada.
--     Nadie escribe directamente en las tablas: solo con las funciones de abajo.
--   · Resumen (cesi_finance_summary): ingresos, gastos y saldo del mes, saldo total acumulado,
--     los últimos 6 meses, los gastos por categoría y lo gastado por área frente a su presupuesto.
--     Los meses, en la zona de quien mira.

do $$
begin
  if to_regprocedure('public.cesi_notice_save(uuid, text, text, text, boolean, date)') is null then
    raise exception 'Falta la parte 18 (supabase/parte18_avisos_del_equipo.sql): ejecútala antes.';
  end if;
  if not exists (select 1 from public.areas where id = 'finanzas') then
    raise exception 'Falta el área Finanzas (id finanzas): ejecuta antes la parte 5.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tablas
-- -----------------------------------------------------------------------------
--   kind         'ingreso' | 'gasto'
--   amount_cents cantidad en céntimos (siempre positiva; el tipo dice si suma o resta)
--   category     ingreso: patrocinio, donacion, colaboracion, otro
--                gasto: dominio_web, herramientas, premios, publicidad, material, otro
--   method       transferencia, paypal, tarjeta, efectivo, otro
--   contact_id / contact_name  contacto externo de Alianzas (solo en ingresos; el nombre, copiado)
create table if not exists public.finance_movements (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('ingreso', 'gasto')),
  day date not null,
  concept text not null check (length(trim(concept)) between 1 and 200),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000000),
  category text not null,
  area text references public.areas (id) on update cascade on delete set null,
  method text not null default 'transferencia' check (method in ('transferencia', 'paypal', 'tarjeta', 'efectivo', 'otro')),
  receipt_url text not null default '' check (length(receipt_url) <= 1000),
  notes text not null default '' check (length(notes) <= 2000),
  contact_id text,
  contact_name text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_movements_category check (
    (kind = 'ingreso' and category in ('patrocinio', 'donacion', 'colaboracion', 'otro'))
    or (kind = 'gasto' and category in ('dominio_web', 'herramientas', 'premios', 'publicidad', 'material', 'otro'))
  )
);
create index if not exists finance_movements_day_idx on public.finance_movements (day);

create table if not exists public.finance_budgets (
  area text primary key references public.areas (id) on update cascade on delete cascade,
  monthly_cents bigint not null check (monthly_cents >= 0 and monthly_cents <= 100000000000),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

--   action  'alta' | 'edicion' | 'borrado' | 'presupuesto'
--   who_name  el nombre de quien lo hizo (se queda aunque se elimine su cuenta)
create table if not exists public.finance_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  who uuid references public.profiles (id) on delete set null,
  who_name text not null default '',
  action text not null,
  movement_id uuid,
  area text,
  before jsonb,
  after jsonb
);
create index if not exists finance_log_at_idx on public.finance_log (at desc);

-- -----------------------------------------------------------------------------
-- Ayudas
-- -----------------------------------------------------------------------------

-- Qué puede hacer `p_profile` en Finanzas: 'edit' (Finanzas y la ceo), 'view' (Directivo) o null.
create or replace function public.cesi_finance_role(p_profile uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.role = 'ceo' then 'edit'
    when p.role = 'equipo' and p.area = 'finanzas' then 'edit'
    when p.role = 'equipo' and p.area = 'direccion' then 'view'
  end
  from public.profiles p
  where p.id = p_profile;
$$;

-- Quién mira (o, solo la ceo, otra cuenta con p_as: «Ver como»). Error si no ve Finanzas.
create or replace function public.cesi_finance_viewer(p_as uuid)
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
    v_me := p_as;
  end if;
  if public.cesi_finance_role(v_me) is null then
    raise exception 'No tienes acceso a Finanzas.' using errcode = '42501';
  end if;
  return v_me;
end;
$$;

-- Solo Finanzas y la ceo escriben.
create or replace function public.cesi_finance_writer()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if public.cesi_finance_role(v_me) is distinct from 'edit' then
    raise exception 'Solo Finanzas y la dirección pueden cambiar las finanzas.' using errcode = '42501';
  end if;
  return v_me;
end;
$$;

-- La usan las reglas de acceso de abajo (con la cuenta que lee): tiene que poder ejecutarse.
revoke all on function public.cesi_finance_role(uuid) from public, anon;
grant execute on function public.cesi_finance_role(uuid) to authenticated;
revoke all on function public.cesi_finance_viewer(uuid) from public, anon, authenticated;
revoke all on function public.cesi_finance_writer() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Reglas de acceso (solo leer; escribir, con las funciones)
-- -----------------------------------------------------------------------------
alter table public.finance_movements enable row level security;
alter table public.finance_budgets enable row level security;
alter table public.finance_log enable row level security;

drop policy if exists "finance_movements: leer (Finanzas, Directivo y la ceo)" on public.finance_movements;
create policy "finance_movements: leer (Finanzas, Directivo y la ceo)" on public.finance_movements
  for select to authenticated using (public.cesi_finance_role((select auth.uid())) is not null);

drop policy if exists "finance_budgets: leer (Finanzas, Directivo y la ceo)" on public.finance_budgets;
create policy "finance_budgets: leer (Finanzas, Directivo y la ceo)" on public.finance_budgets
  for select to authenticated using (public.cesi_finance_role((select auth.uid())) is not null);

drop policy if exists "finance_log: leer (Finanzas, Directivo y la ceo)" on public.finance_log;
create policy "finance_log: leer (Finanzas, Directivo y la ceo)" on public.finance_log
  for select to authenticated using (public.cesi_finance_role((select auth.uid())) is not null);

revoke all on public.finance_movements, public.finance_budgets, public.finance_log from anon;
revoke all on public.finance_movements, public.finance_budgets, public.finance_log from authenticated;
grant select on public.finance_movements, public.finance_budgets, public.finance_log to authenticated;

-- -----------------------------------------------------------------------------
-- Leer
-- -----------------------------------------------------------------------------

-- Los movimientos (del más reciente al más antiguo), con el nombre del área y de quién los creó
-- y cambió. can_edit: Finanzas y la ceo (no en «Ver como»).
create or replace function public.cesi_finance_movements(p_as uuid default null)
returns table (
  id uuid, kind text, day date, concept text, amount_cents bigint, category text, area text, area_name text,
  method text, receipt_url text, notes text, contact_id text, contact_name text,
  created_by_name text, updated_by_name text, created_at timestamptz, updated_at timestamptz, can_edit boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := public.cesi_finance_viewer(p_as);
  v_edit boolean := public.cesi_finance_role(v_me) = 'edit' and (p_as is null or p_as = (select auth.uid()));
begin
  return query
    select m.id, m.kind, m.day, m.concept, m.amount_cents, m.category, m.area, coalesce(a.name, ''),
      m.method, m.receipt_url, m.notes, m.contact_id, m.contact_name,
      case when m.created_by is null then '' else public.cesi_person_name(m.created_by) end,
      case when m.updated_by is null then '' else public.cesi_person_name(m.updated_by) end,
      m.created_at, m.updated_at, v_edit
    from public.finance_movements m
    left join public.areas a on a.id = m.area
    order by m.day desc, m.created_at desc;
end;
$$;

-- Resumen: { month, income, expense, balance, total_balance, months: [{ month, income, expense }]
-- (los últimos 6, del más antiguo al actual), by_category: [{ category, cents }] (gastos del mes),
-- budgets: [{ area, area_name, monthly, spent }] (todas las áreas; monthly null si no tiene) }.
-- p_month: primer día del mes (null: el actual en mi zona). Cantidades en céntimos.
create or replace function public.cesi_finance_summary(p_month date default null, p_as uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_finance_viewer(p_as);
  v_month date := date_trunc('month', coalesce(p_month, (now() at time zone public.cesi_zone_of(v_me))::date))::date;
  v_next date := (v_month + interval '1 month')::date;
begin
  return jsonb_build_object(
    'month', v_month,
    'income', (select coalesce(sum(amount_cents), 0) from public.finance_movements where kind = 'ingreso' and day >= v_month and day < v_next),
    'expense', (select coalesce(sum(amount_cents), 0) from public.finance_movements where kind = 'gasto' and day >= v_month and day < v_next),
    'balance', (select coalesce(sum(case when kind = 'ingreso' then amount_cents else -amount_cents end), 0)
                from public.finance_movements where day >= v_month and day < v_next),
    'total_balance', (select coalesce(sum(case when kind = 'ingreso' then amount_cents else -amount_cents end), 0)
                      from public.finance_movements where day < v_next),
    'months', (
      select jsonb_agg(jsonb_build_object(
        'month', mm.m,
        'income', (select coalesce(sum(amount_cents), 0) from public.finance_movements
                   where kind = 'ingreso' and day >= mm.m and day < (mm.m + interval '1 month')::date),
        'expense', (select coalesce(sum(amount_cents), 0) from public.finance_movements
                    where kind = 'gasto' and day >= mm.m and day < (mm.m + interval '1 month')::date)
      ) order by mm.m)
      from (select (v_month - make_interval(months => g))::date as m from generate_series(0, 5) g) mm
    ),
    'by_category', coalesce((
      select jsonb_agg(jsonb_build_object('category', category, 'cents', cents) order by cents desc)
      from (select category, sum(amount_cents) as cents from public.finance_movements
            where kind = 'gasto' and day >= v_month and day < v_next group by category) c
    ), '[]'::jsonb),
    'budgets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'area', a.id, 'area_name', a.name, 'monthly', b.monthly_cents,
        'spent', (select coalesce(sum(amount_cents), 0) from public.finance_movements
                  where kind = 'gasto' and area = a.id and day >= v_month and day < v_next)
      ) order by a.sort)
      from public.areas a
      left join public.finance_budgets b on b.area = a.id
    ), '[]'::jsonb)
  );
end;
$$;

-- Saldo del mes (para «Mi equipo» y el Inicio de Directivo y de Finanzas).
create or replace function public.cesi_finance_month_balance(p_as uuid default null)
returns table (income bigint, expense bigint, balance bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_finance_viewer(p_as);
  v_month date := date_trunc('month', (now() at time zone public.cesi_zone_of(v_me))::date)::date;
  v_next date := (v_month + interval '1 month')::date;
begin
  return query
    select
      coalesce(sum(m.amount_cents) filter (where m.kind = 'ingreso'), 0)::bigint,
      coalesce(sum(m.amount_cents) filter (where m.kind = 'gasto'), 0)::bigint,
      coalesce(sum(case when m.kind = 'ingreso' then m.amount_cents else -m.amount_cents end), 0)::bigint
    from public.finance_movements m
    where m.day >= v_month and m.day < v_next;
end;
$$;

-- Historial de cambios (los 200 más recientes).
create or replace function public.cesi_finance_log(p_as uuid default null)
returns table (id bigint, at timestamptz, who_name text, action text, movement_id uuid, area text, before jsonb, after jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := public.cesi_finance_viewer(p_as);
begin
  return query
    select l.id, l.at, l.who_name, l.action, l.movement_id, l.area, l.before, l.after
    from public.finance_log l
    order by l.at desc, l.id desc
    limit 200;
end;
$$;

-- Contactos externos con seguimiento de alianza (para unir un ingreso): solo el id y el nombre.
create or replace function public.cesi_finance_contacts()
returns table (id text, name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.cesi_finance_writer();
  return query
    select c.id, coalesce(nullif(trim(c.data ->> 'name'), ''), 'Sin nombre')
    from public.contacts c
    where c.user_id in (select id from public.profiles where role = 'ceo') and c.deleted_at is null
      and jsonb_typeof(c.data -> 'alliance') = 'object' and public.cesi_is_external_contact(c.data)
    order by 2;
end;
$$;

-- -----------------------------------------------------------------------------
-- Escribir
-- -----------------------------------------------------------------------------

-- El movimiento como se guarda en el historial.
create or replace function public.cesi_finance_row(m public.finance_movements)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('kind', m.kind, 'day', m.day, 'concept', m.concept, 'amount_cents', m.amount_cents,
    'category', m.category, 'area', m.area, 'method', m.method, 'receipt_url', m.receipt_url, 'notes', m.notes,
    'contact_name', m.contact_name);
$$;

revoke all on function public.cesi_finance_row(public.finance_movements) from public, anon, authenticated;

-- Crear (p_id null) o editar un movimiento (Finanzas y la ceo). p_contact: contacto externo de
-- Alianzas (solo en ingresos). Devuelve el id.
create or replace function public.cesi_finance_save(
  p_id uuid, p_kind text, p_day date, p_concept text, p_amount_cents bigint, p_category text, p_area text,
  p_method text, p_receipt_url text, p_notes text, p_contact text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_finance_writer();
  v_id uuid := p_id;
  v_old public.finance_movements;
  v_new public.finance_movements;
  v_contact text := nullif(p_contact, '');
  v_contact_name text := '';
begin
  if coalesce(p_kind, '') not in ('ingreso', 'gasto') then
    raise exception 'Elige si es un ingreso o un gasto.' using errcode = '22023';
  end if;
  if p_day is null then
    raise exception 'Pon la fecha.' using errcode = '22023';
  end if;
  if not ((p_kind = 'ingreso' and coalesce(p_category, '') in ('patrocinio', 'donacion', 'colaboracion', 'otro'))
       or (p_kind = 'gasto' and coalesce(p_category, '') in ('dominio_web', 'herramientas', 'premios', 'publicidad', 'material', 'otro'))) then
    raise exception 'Elige una categoría de %.', p_kind using errcode = '22023';
  end if;
  if coalesce(p_method, '') not in ('', 'transferencia', 'paypal', 'tarjeta', 'efectivo', 'otro') then
    raise exception 'Método no válido.' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_concept, ''))) = 0 or length(trim(p_concept)) > 200 then
    raise exception 'Escribe el concepto (como mucho 200 caracteres).' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000000 then
    raise exception 'Pon una cantidad mayor que 0.' using errcode = '22023';
  end if;
  if p_area is not null and not exists (select 1 from public.areas where id = p_area) then
    raise exception 'Esa área no existe.' using errcode = '22023';
  end if;
  if coalesce(p_receipt_url, '') <> '' and p_receipt_url !~* '^https?://\S+$' then
    raise exception 'El justificante tiene que ser un enlace que empiece por https://' using errcode = '22023';
  end if;
  if v_contact is not null then
    if p_kind <> 'ingreso' then
      raise exception 'Solo un ingreso puede venir de una alianza.' using errcode = '22023';
    end if;
    select coalesce(nullif(trim(c.data ->> 'name'), ''), 'Sin nombre') into v_contact_name
    from public.contacts c
    where c.id = v_contact and c.deleted_at is null and c.user_id in (select id from public.profiles where role = 'ceo')
      and public.cesi_is_external_contact(c.data);
    if v_contact_name is null then
      raise exception 'Ese contacto externo ya no existe.' using errcode = '22023';
    end if;
  end if;

  if v_id is null then
    insert into public.finance_movements (kind, day, concept, amount_cents, category, area, method, receipt_url, notes,
      contact_id, contact_name, created_by, updated_by)
    values (p_kind, p_day, trim(p_concept), p_amount_cents, p_category, p_area, coalesce(nullif(p_method, ''), 'transferencia'),
      trim(coalesce(p_receipt_url, '')), trim(coalesce(p_notes, '')), v_contact, coalesce(v_contact_name, ''), v_me, v_me)
    returning * into v_new;
    insert into public.finance_log (who, who_name, action, movement_id, area, before, after)
    values (v_me, public.cesi_person_name(v_me), 'alta', v_new.id, v_new.area, null, public.cesi_finance_row(v_new));
    return v_new.id;
  end if;

  select * into v_old from public.finance_movements where id = v_id for update;
  if not found then
    raise exception 'Ese movimiento ya no existe.' using errcode = '22023';
  end if;
  update public.finance_movements
  set kind = p_kind, day = p_day, concept = trim(p_concept), amount_cents = p_amount_cents, category = p_category,
      area = p_area, method = coalesce(nullif(p_method, ''), 'transferencia'), receipt_url = trim(coalesce(p_receipt_url, '')),
      notes = trim(coalesce(p_notes, '')), contact_id = v_contact, contact_name = coalesce(v_contact_name, ''),
      updated_by = v_me, updated_at = now()
  where id = v_id
  returning * into v_new;
  insert into public.finance_log (who, who_name, action, movement_id, area, before, after)
  values (v_me, public.cesi_person_name(v_me), 'edicion', v_id, v_new.area, public.cesi_finance_row(v_old), public.cesi_finance_row(v_new));
  return v_id;
end;
$$;

-- Borrar un movimiento (Finanzas y la ceo). Queda en el historial.
create or replace function public.cesi_finance_delete(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_finance_writer();
  v_old public.finance_movements;
begin
  delete from public.finance_movements where id = p_id returning * into v_old;
  if not found then
    raise exception 'Ese movimiento ya no existe.' using errcode = '22023';
  end if;
  insert into public.finance_log (who, who_name, action, movement_id, area, before, after)
  values (v_me, public.cesi_person_name(v_me), 'borrado', p_id, v_old.area, public.cesi_finance_row(v_old), null);
end;
$$;

-- Presupuesto mensual de un área (Finanzas y la ceo). p_monthly_cents null: sin presupuesto.
create or replace function public.cesi_finance_budget_set(p_area text, p_monthly_cents bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_finance_writer();
  v_old bigint;
begin
  if p_area is null or not exists (select 1 from public.areas where id = p_area) then
    raise exception 'Esa área no existe.' using errcode = '22023';
  end if;
  if p_monthly_cents is not null and (p_monthly_cents < 0 or p_monthly_cents > 100000000000) then
    raise exception 'Presupuesto no válido.' using errcode = '22023';
  end if;
  select monthly_cents into v_old from public.finance_budgets where area = p_area;
  if p_monthly_cents is null then
    delete from public.finance_budgets where area = p_area;
  else
    insert into public.finance_budgets (area, monthly_cents, updated_by, updated_at)
    values (p_area, p_monthly_cents, v_me, now())
    on conflict (area) do update set monthly_cents = excluded.monthly_cents, updated_by = excluded.updated_by, updated_at = now();
  end if;
  insert into public.finance_log (who, who_name, action, area, before, after)
  values (v_me, public.cesi_person_name(v_me), 'presupuesto', p_area,
    case when v_old is null then null else jsonb_build_object('monthly_cents', v_old) end,
    case when p_monthly_cents is null then null else jsonb_build_object('monthly_cents', p_monthly_cents) end);
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos de las funciones
-- -----------------------------------------------------------------------------
revoke all on function public.cesi_finance_movements(uuid) from public, anon;
revoke all on function public.cesi_finance_summary(date, uuid) from public, anon;
revoke all on function public.cesi_finance_month_balance(uuid) from public, anon;
revoke all on function public.cesi_finance_log(uuid) from public, anon;
revoke all on function public.cesi_finance_contacts() from public, anon;
revoke all on function public.cesi_finance_save(uuid, text, date, text, bigint, text, text, text, text, text, text) from public, anon;
revoke all on function public.cesi_finance_delete(uuid) from public, anon;
revoke all on function public.cesi_finance_budget_set(text, bigint) from public, anon;
grant execute on function public.cesi_finance_movements(uuid) to authenticated;
grant execute on function public.cesi_finance_summary(date, uuid) to authenticated;
grant execute on function public.cesi_finance_month_balance(uuid) to authenticated;
grant execute on function public.cesi_finance_log(uuid) to authenticated;
grant execute on function public.cesi_finance_contacts() to authenticated;
grant execute on function public.cesi_finance_save(uuid, text, date, text, bigint, text, text, text, text, text, text) to authenticated;
grant execute on function public.cesi_finance_delete(uuid) to authenticated;
grant execute on function public.cesi_finance_budget_set(text, bigint) to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: las 3 tablas, las 8 funciones con permiso (8) y la interna sin él (false).
select
  to_regclass('public.finance_movements') is not null and to_regclass('public.finance_budgets') is not null
    and to_regclass('public.finance_log') is not null as tablas,
  (select count(*) from unnest(array[
     'public.cesi_finance_movements(uuid)', 'public.cesi_finance_summary(date, uuid)',
     'public.cesi_finance_month_balance(uuid)', 'public.cesi_finance_log(uuid)', 'public.cesi_finance_contacts()',
     'public.cesi_finance_save(uuid, text, date, text, bigint, text, text, text, text, text, text)',
     'public.cesi_finance_delete(uuid)', 'public.cesi_finance_budget_set(text, bigint)'
   ]) as f (sig) where has_function_privilege('authenticated', f.sig, 'execute')) as funciones_con_permiso,
  has_function_privilege('authenticated', 'public.cesi_finance_writer()', 'execute') as interna;

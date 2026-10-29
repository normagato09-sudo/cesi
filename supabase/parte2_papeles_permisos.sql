-- =============================================================================
-- CIFA · Parte 2: áreas y permisos del equipo; los datos actuales, solo para la ceo
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de las partes 1a y
-- 1b. No hace falta cambiar nada a mano.
--
-- Qué hace:
--   · Tablas nuevas: areas (Dirección, Formación, Comunicación, Alianzas, Personas),
--     area_permissions (permisos por defecto de cada área) y profile_permissions (permisos de
--     una persona que sustituyen a los de su área). Columna nueva: profiles.area.
--   · Funciones para futuras políticas: my_role(), my_area(), can_access(pantalla, nivel) y
--     my_permissions() (lo que usa la app). La ceo siempre puede todo.
--   · Solo la ceo cambia áreas y permisos.
--   · Tablas actuales: solo la ceo (is_ceo()) puede leer y escribir (antes, cualquier cuenta podía
--     guardar filas propias): las 14 de la sincronización (events, contacts, groups, settings,
--     rules, proposals, weekly_availability, projects, tasks, vacancies, students, courses,
--     attendance, extra_classes), contact_links, booking_links, booking_requests y el bucket de
--     fotos y CV (cesi-photos). Las páginas públicas /ficha y /reservar no cambian: usan
--     funciones security definer, que no pasan por estas políticas.
-- No borra datos ni cambia user_id. Se puede ejecutar más de una vez: los permisos por defecto
-- solo se ponen si no están (no deshace los que cambies luego).

-- Comprobación: tienen que existir profiles e is_ceo() y haber una cuenta ceo; si no, la ceo se
-- quedaría sin sus datos.
do $$
begin
  if to_regprocedure('public.is_ceo()') is null or to_regclass('public.profiles') is null then
    raise exception 'Falta la parte 1a (supabase/parte1a_cuentas_papeles.sql): ejecútala antes.';
  end if;
  if not exists (select 1 from public.profiles where role = 'ceo') then
    raise exception 'No hay ninguna cuenta ceo en profiles: ejecuta la parte 1a con tu correo antes.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Áreas y permisos
-- ---------------------------------------------------------------------------
-- Pantallas: calendario, contactos, huecos, equipo, vacantes, fichajes, cursos, alumnos,
-- asistencia. Niveles: none (no la ve), read (ver), write (editar).
create table if not exists public.areas (
  id text primary key check (id ~ '^[a-z_]{1,40}$'),
  name text not null check (length(name) between 1 and 60),
  sort int not null default 0
);

insert into public.areas (id, name, sort) values
  ('direccion', 'Dirección', 1),
  ('formacion', 'Formación', 2),
  ('comunicacion', 'Comunicación', 3),
  ('alianzas', 'Alianzas', 4),
  ('personas', 'Personas', 5)
on conflict (id) do nothing;

create table if not exists public.area_permissions (
  area text not null references public.areas (id) on update cascade on delete cascade,
  screen text not null check (screen in ('calendario', 'contactos', 'huecos', 'equipo', 'vacantes', 'fichajes', 'cursos', 'alumnos', 'asistencia')),
  level text not null check (level in ('none', 'read', 'write')),
  primary key (area, screen)
);

create table if not exists public.profile_permissions (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  screen text not null check (screen in ('calendario', 'contactos', 'huecos', 'equipo', 'vacantes', 'fichajes', 'cursos', 'alumnos', 'asistencia')),
  level text not null check (level in ('none', 'read', 'write')),
  primary key (profile_id, screen)
);

alter table public.profiles add column if not exists area text
  references public.areas (id) on update cascade on delete set null;

-- Permisos por defecto (solo los que falten).
insert into public.area_permissions (area, screen, level)
select a.id, s.screen,
  coalesce(d.level, case when a.id = 'direccion' then 'read' else 'none' end)
from public.areas a
cross join unnest(array['calendario', 'contactos', 'huecos', 'equipo', 'vacantes', 'fichajes', 'cursos', 'alumnos', 'asistencia']) as s (screen)
left join (values
  ('direccion', 'fichajes', 'write'),
  ('formacion', 'cursos', 'write'),
  ('formacion', 'alumnos', 'write'),
  ('formacion', 'asistencia', 'write'),
  ('formacion', 'calendario', 'read'),
  ('formacion', 'fichajes', 'write'),
  ('comunicacion', 'calendario', 'read'),
  ('comunicacion', 'fichajes', 'write'),
  ('alianzas', 'contactos', 'write'),
  ('alianzas', 'calendario', 'read'),
  ('alianzas', 'fichajes', 'write'),
  ('personas', 'equipo', 'write'),
  ('personas', 'vacantes', 'write'),
  ('personas', 'alumnos', 'read'),
  ('personas', 'fichajes', 'write')
) as d (area, screen, level) on d.area = a.id and d.screen = s.screen
where a.id in ('direccion', 'formacion', 'comunicacion', 'alianzas', 'personas')
on conflict (area, screen) do nothing;

-- ---------------------------------------------------------------------------
-- Funciones (security definer: leen profiles y permisos sin pasar por su RLS)
-- ---------------------------------------------------------------------------
-- Papel de la cuenta actual ('ceo' | 'equipo' | 'alumno' | 'pendiente'), null sin perfil.
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

-- Área de la cuenta actual (null si no tiene).
create or replace function public.my_area()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select area from public.profiles where id = (select auth.uid());
$$;

-- Nivel de la cuenta actual en una pantalla: la ceo, write; equipo, el suyo propio o el de su
-- área; el resto, none.
create or replace function public.cesi_my_level(p_screen text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.role = 'ceo' then 'write'
    when p.role = 'equipo' then coalesce(
      (select pp.level from public.profile_permissions pp where pp.profile_id = p.id and pp.screen = p_screen),
      (select ap.level from public.area_permissions ap where ap.area = p.area and ap.screen = p_screen),
      'none'
    )
    else 'none'
  end
  from public.profiles p
  where p.id = (select auth.uid());
$$;

-- ¿Puede la cuenta actual ver ('read') o editar ('write') esa pantalla? La ceo, siempre.
create or replace function public.can_access(p_screen text, p_level text default 'read')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    array_position(array['none', 'read', 'write'], public.cesi_my_level(p_screen))
      >= array_position(array['none', 'read', 'write'], coalesce(p_level, 'read')),
    false
  );
$$;

-- Lo que usa la app: { pantalla: nivel } de la cuenta actual (todas las pantallas).
create or replace function public.my_permissions()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(s.screen, coalesce(public.cesi_my_level(s.screen), 'none')), '{}'::jsonb)
  from unnest(array['calendario', 'contactos', 'huecos', 'equipo', 'vacantes', 'fichajes', 'cursos', 'alumnos', 'asistencia']) as s (screen);
$$;

revoke all on function public.my_role() from public, anon;
revoke all on function public.my_area() from public, anon;
revoke all on function public.cesi_my_level(text) from public, anon, authenticated;
revoke all on function public.can_access(text, text) from public, anon;
revoke all on function public.my_permissions() from public, anon;
grant execute on function public.my_role() to authenticated;
grant execute on function public.my_area() to authenticated;
grant execute on function public.can_access(text, text) to authenticated;
grant execute on function public.my_permissions() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS de áreas y permisos: cualquiera con sesión lee las áreas; solo la ceo cambia nada.
-- ---------------------------------------------------------------------------
alter table public.areas enable row level security;
drop policy if exists "areas: leer" on public.areas;
drop policy if exists "areas: cambiar (solo la ceo)" on public.areas;
create policy "areas: leer" on public.areas for select to authenticated using (true);
create policy "areas: cambiar (solo la ceo)" on public.areas for all to authenticated
  using ((select public.is_ceo())) with check ((select public.is_ceo()));

alter table public.area_permissions enable row level security;
drop policy if exists "area_permissions: leer (solo la ceo)" on public.area_permissions;
drop policy if exists "area_permissions: cambiar (solo la ceo)" on public.area_permissions;
create policy "area_permissions: leer (solo la ceo)" on public.area_permissions for select to authenticated
  using ((select public.is_ceo()));
create policy "area_permissions: cambiar (solo la ceo)" on public.area_permissions for all to authenticated
  using ((select public.is_ceo())) with check ((select public.is_ceo()));

alter table public.profile_permissions enable row level security;
drop policy if exists "profile_permissions: leer los míos (la ceo, todos)" on public.profile_permissions;
drop policy if exists "profile_permissions: cambiar (solo la ceo)" on public.profile_permissions;
create policy "profile_permissions: leer los míos (la ceo, todos)" on public.profile_permissions for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_ceo()));
create policy "profile_permissions: cambiar (solo la ceo)" on public.profile_permissions for all to authenticated
  using ((select public.is_ceo())) with check ((select public.is_ceo()));

revoke all on public.areas, public.area_permissions, public.profile_permissions from anon;
grant select, insert, update, delete on public.areas, public.area_permissions, public.profile_permissions to authenticated;

-- El área de una cuenta la cambia la ceo, como el papel (la política de profiles ya es solo ceo).
grant update (display_name, role, linked_team_id, linked_student_id, area) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Tablas actuales: solo la ceo
-- ---------------------------------------------------------------------------
-- Sincronización: mismas políticas que antes (mismos nombres) + solo la ceo.
do $$
declare
  t text;
begin
  foreach t in array array['events', 'contacts', 'groups', 'settings', 'rules', 'proposals', 'weekly_availability', 'projects', 'vacancies', 'tasks', 'students', 'courses', 'attendance', 'extra_classes'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'No existe la tabla %: se salta.', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s: leer las mías" on public.%I', t, t);
    execute format('drop policy if exists "%s: crear las mías" on public.%I', t, t);
    execute format('drop policy if exists "%s: editar las mías" on public.%I', t, t);
    execute format('drop policy if exists "%s: borrar las mías" on public.%I', t, t);
    execute format(
      'create policy "%s: leer las mías" on public.%I for select to authenticated using ((select auth.uid()) = user_id and (select public.is_ceo()))',
      t, t
    );
    execute format(
      'create policy "%s: crear las mías" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id and (select public.is_ceo()))',
      t, t
    );
    execute format(
      'create policy "%s: editar las mías" on public.%I for update to authenticated using ((select auth.uid()) = user_id and (select public.is_ceo())) with check ((select auth.uid()) = user_id and (select public.is_ceo()))',
      t, t
    );
    execute format(
      'create policy "%s: borrar las mías" on public.%I for delete to authenticated using ((select auth.uid()) = user_id and (select public.is_ceo()))',
      t, t
    );
  end loop;
end;
$$;

-- Enlaces /ficha y de reservas: lo mismo (mismos nombres de política que en schema.sql).
do $$
declare
  t text;
  verbs text[];
  v text;
  own constant text := '(select auth.uid()) = user_id and (select public.is_ceo())';
begin
  foreach t in array array['contact_links', 'booking_links', 'booking_requests'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'No existe la tabla %: se salta.', t;
      continue;
    end if;
    -- booking_requests no tiene «crear»: las solicitudes solo las crea cesi_booking_request.
    verbs := case when t = 'booking_requests' then array['leer', 'editar', 'borrar'] else array['leer', 'crear', 'editar', 'borrar'] end;
    execute format('alter table public.%I enable row level security', t);
    foreach v in array verbs loop
      execute format('drop policy if exists "%s: %s los míos" on public.%I', t, v, t);
      execute format(
        'create policy "%s: %s los míos" on public.%I for %s to authenticated %s',
        t, v, t,
        case v when 'leer' then 'select' when 'crear' then 'insert' when 'editar' then 'update' else 'delete' end,
        case v
          when 'crear' then format('with check (%s)', own)
          when 'editar' then format('using (%s) with check (%s)', own, own)
          else format('using (%s)', own)
        end
      );
    end loop;
  end loop;
end;
$$;

-- Fotos y CV (bucket cesi-photos): cada archivo va en la carpeta de su cuenta; solo la ceo.
drop policy if exists "cesi-photos: leer los míos" on storage.objects;
drop policy if exists "cesi-photos: subir los míos" on storage.objects;
drop policy if exists "cesi-photos: cambiar los míos" on storage.objects;
drop policy if exists "cesi-photos: borrar los míos" on storage.objects;

create policy "cesi-photos: leer los míos" on storage.objects
  for select to authenticated
  using (bucket_id = 'cesi-photos' and (storage.foldername(name))[1] = (select auth.uid()::text) and (select public.is_ceo()));

create policy "cesi-photos: subir los míos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cesi-photos' and (storage.foldername(name))[1] = (select auth.uid()::text) and (select public.is_ceo()));

create policy "cesi-photos: cambiar los míos" on storage.objects
  for update to authenticated
  using (bucket_id = 'cesi-photos' and (storage.foldername(name))[1] = (select auth.uid()::text) and (select public.is_ceo()))
  with check (bucket_id = 'cesi-photos' and (storage.foldername(name))[1] = (select auth.uid()::text) and (select public.is_ceo()));

create policy "cesi-photos: borrar los míos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'cesi-photos' and (storage.foldername(name))[1] = (select auth.uid()::text) and (select public.is_ceo()));

notify pgrst, 'reload schema';

-- Comprobación: todas las políticas de las tablas actuales deben salir con solo_ceo = true.
select tablename, policyname, (coalesce(qual, '') || coalesce(with_check, '')) like '%is_ceo%' as solo_ceo
from pg_policies
where (schemaname = 'public' and tablename in ('events', 'contacts', 'groups', 'settings', 'rules', 'proposals', 'weekly_availability', 'projects', 'vacancies', 'tasks', 'students', 'courses', 'attendance', 'extra_classes', 'contact_links', 'booking_links', 'booking_requests'))
   or (schemaname = 'storage' and policyname like 'cesi-photos:%')
order by solo_ceo, tablename, policyname;

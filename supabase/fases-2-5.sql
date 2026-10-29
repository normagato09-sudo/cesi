-- =============================================================================
-- CIFA · Tablas que faltan en Supabase: alumnos, cursos, pase de lista y clases sueltas
-- =============================================================================
-- Ejecutar una vez en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu).
-- Es lo mismo que hay en schema.sql para estas 4 tablas. Se puede ejecutar más de una vez:
-- no borra ni cambia datos (create ... if not exists; los triggers y las políticas se quitan
-- y se vuelven a crear iguales).

-- Alumnos (localStorage: cesi_students_v1)
create table if not exists public.students (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Cursos (localStorage: cesi_courses_v1)
create table if not exists public.courses (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Pase de lista (localStorage: cesi_attendance_v1)
create table if not exists public.attendance (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Clases sueltas de los cursos (localStorage: cesi_extra_classes_v1)
create table if not exists public.extra_classes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Gana el updated_at más reciente (ya existe; se vuelve a crear igual por si acaso).
create or replace function public.cesi_keep_newest()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.server_updated_at = clock_timestamp();
  return new;
end;
$$;

-- Triggers, índices, RLS (cada usuario solo ve lo suyo) y Realtime de las 4 tablas.
do $$
declare
  t text;
begin
  foreach t in array array['students', 'courses', 'attendance', 'extra_classes'] loop
    execute format('drop trigger if exists %I_keep_newest on public.%I', t, t);
    execute format(
      'create trigger %I_keep_newest before insert or update on public.%I for each row execute function public.cesi_keep_newest()',
      t, t
    );
    execute format('drop index if exists public.%I', t || '_updated_idx');
    execute format('create index if not exists %I on public.%I (user_id, server_updated_at)', t || '_server_updated_idx', t);

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s: leer las mías" on public.%I', t, t);
    execute format('drop policy if exists "%s: crear las mías" on public.%I', t, t);
    execute format('drop policy if exists "%s: editar las mías" on public.%I', t, t);
    execute format('drop policy if exists "%s: borrar las mías" on public.%I', t, t);
    execute format('create policy "%s: leer las mías" on public.%I for select using (auth.uid() = user_id)', t, t);
    execute format('create policy "%s: crear las mías" on public.%I for insert with check (auth.uid() = user_id)', t, t);
    execute format(
      'create policy "%s: editar las mías" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t, t
    );
    execute format('create policy "%s: borrar las mías" on public.%I for delete using (auth.uid() = user_id)', t, t);

    -- Realtime: los cambios de otro dispositivo llegan solos (respetando RLS).
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end loop;
end;
$$;

-- Que la API vea las tablas nuevas enseguida.
notify pgrst, 'reload schema';

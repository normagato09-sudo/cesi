-- Esquema de Supabase para sincronizar CESI entre dispositivos.
--
-- Todavía no está conectado: la app guarda los datos en localStorage. Este esquema deja
-- preparada la base de datos para cuando se active la sincronización.
--
-- Cada colección guarda los mismos documentos JSON que la app tiene en localStorage
-- (columna `data`), con el id del documento y el usuario propietario. Las filas borradas
-- se marcan con `deleted_at` para que el borrado también se sincronice.
-- Cada usuario solo puede leer y escribir sus propias filas (RLS).

-- ---------------------------------------------------------------------------
-- Función común: actualiza updated_at en cada cambio
-- ---------------------------------------------------------------------------
create or replace function public.cesi_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reuniones y franjas no disponibles (localStorage: cesi_events_v1)
-- data: { title, start, end, category, tags, participantIds, guests, participants,
--         meetLink, description, isUnavailable, allDay, recurrence,
--         provisional, proposalId (opciones de una propuesta),
--         notes (reunión única) o notesByDate { 'AAAA-MM-DD': texto } (reunión que se repite) }
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------------
-- Contactos (localStorage: cesi_contacts_v1)
-- data: { name, email, phone, organization, role, notes,
--         country (ISO 3166-1 alfa-2, obligatorio), timeZone (zona IANA, obligatoria),
--         countryUnreviewed (true si se le asignó España al migrar un contacto antiguo),
--         availability: horario semanal con varias franjas por día, en su zona horaria, o null,
--         groupIds: ids de los grupos a los que pertenece (tabla groups) }
-- ---------------------------------------------------------------------------
create table if not exists public.contacts (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------------
-- Grupos de contactos (localStorage: cesi_groups_v1)
-- data: { name, color }. Al borrar un grupo se quita de los groupIds de sus contactos.
-- ---------------------------------------------------------------------------
create table if not exists public.groups (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------------
-- Ajustes de un solo documento por usuario
--   key = 'working_hours' (cesi_working_hours_v1): horario semanal con varias franjas por día
--   key = 'preferences'   (cesi_preferences_v1):   { bufferMinutes }
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- ---------------------------------------------------------------------------
-- Reglas por tipo de reunión (localStorage: cesi_rules_v1)
-- data: { enabled, targetType: 'category' | 'tag', target, days: [0..6],
--         timeOfDay: 'any' | 'morning' | 'afternoon' | 'custom', customStart, customEnd,
--         maxDurationMinutes, maxPerDay }
-- ---------------------------------------------------------------------------
create table if not exists public.rules (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------------
-- Propuestas de varias opciones (localStorage: cesi_proposals_v1)
-- data: { title, durationMinutes, category, tags, participantIds, guests }
-- Cada opción es una fila de events con data.provisional = true y data.proposalId = id.
-- ---------------------------------------------------------------------------
create table if not exists public.proposals (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------------
-- Triggers, índices y RLS de todas las tablas
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['events', 'contacts', 'groups', 'settings', 'rules', 'proposals'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format(
      'create trigger %I_touch before update on public.%I for each row execute function public.cesi_touch_updated_at()',
      t, t
    );
    execute format('create index if not exists %I_updated_idx on public.%I (user_id, updated_at)', t, t);

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
  end loop;
end;
$$;
